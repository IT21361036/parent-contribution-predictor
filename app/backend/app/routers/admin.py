from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/admin", tags=["admin"])

require_admin = require_role("admin")


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # 'admin' | 'parent' | 'child'
    grade_level: str | None = None


class LinkParentChildRequest(BaseModel):
    parent_id: str
    child_id: str
    relationship: str | None = None


class UpdateUserRequest(BaseModel):
    full_name: str | None = None
    role: str | None = None
    grade_level: str | None = None


def _cascade_delete_user_data(client, user_id: str) -> None:
    """Remove every row that references this profile before the auth user
    (and its profiles row, via ON DELETE CASCADE) is deleted — none of these
    other foreign keys cascade, so deleting the auth user first would fail
    with a constraint violation.
    """
    quizzes = client.table("quizzes").select("id").eq("created_by", user_id).execute().data
    quiz_ids = [q["id"] for q in quizzes]
    if quiz_ids:
        client.table("quiz_attempts").delete().in_("quiz_id", quiz_ids).execute()
        client.table("quizzes").delete().in_("id", quiz_ids).execute()

    materials = (
        client.table("learning_materials").select("id, storage_path").eq("uploaded_by", user_id).execute().data
    )
    if materials:
        try:
            client.storage.from_("materials").remove([m["storage_path"] for m in materials])
        except Exception:
            pass  # best-effort — don't block account deletion on storage cleanup
        client.table("learning_materials").delete().eq("uploaded_by", user_id).execute()

    client.table("quiz_attempts").delete().eq("child_id", user_id).execute()
    client.table("student_activity").delete().eq("child_id", user_id).execute()
    client.table("monitoring_sessions").delete().eq("parent_id", user_id).execute()
    client.table("monitoring_sessions").delete().eq("child_id", user_id).execute()
    client.table("parent_child_link").delete().eq("parent_id", user_id).execute()
    client.table("parent_child_link").delete().eq("child_id", user_id).execute()


@router.get("/users")
def list_users(_: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    result = client.table("profiles").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(body: CreateUserRequest, _: CurrentUser = Depends(require_admin)):
    if body.role not in {"admin", "parent", "child"}:
        raise HTTPException(status_code=400, detail="Invalid role")

    client = get_service_client()

    created = client.auth.admin.create_user(
        {
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        }
    )
    if created.user is None:
        raise HTTPException(status_code=500, detail="Failed to create auth user")

    # The on_auth_user_created trigger already inserted a 'child' row for
    # this id the instant create_user() ran — upsert to set the real role.
    profile = (
        client.table("profiles")
        .upsert(
            {
                "id": created.user.id,
                "role": body.role,
                "full_name": body.full_name,
                "email": body.email,
                "grade_level": body.grade_level,
            }
        )
        .execute()
    )
    return profile.data[0]


@router.post("/links", status_code=status.HTTP_201_CREATED)
def link_parent_child(body: LinkParentChildRequest, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()

    parent = client.table("profiles").select("role").eq("id", body.parent_id).single().execute().data
    child = client.table("profiles").select("role").eq("id", body.child_id).single().execute().data
    if not parent or parent["role"] != "parent":
        raise HTTPException(status_code=400, detail="parent_id does not reference a parent profile")
    if not child or child["role"] != "child":
        raise HTTPException(status_code=400, detail="child_id does not reference a child profile")

    result = (
        client.table("parent_child_link")
        .insert(
            {
                "parent_id": body.parent_id,
                "child_id": body.child_id,
                "relationship": body.relationship,
            }
        )
        .execute()
    )
    return result.data[0]


@router.get("/links")
def list_links(_: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    result = client.table("parent_child_link").select("*").execute()
    return result.data


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UpdateUserRequest, _: CurrentUser = Depends(require_admin)):
    # exclude_unset (not "filter out None") so the client can explicitly
    # clear grade_level to null — e.g. when a child's role changes to
    # something else — while still omitting fields it never sent.
    updates = body.model_dump(exclude_unset=True)
    if "role" in updates and updates["role"] not in {"admin", "parent", "child"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    client = get_service_client()
    result = client.table("profiles").update(updates).eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    return result.data[0]


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: str, admin: CurrentUser = Depends(require_admin)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account")

    client = get_service_client()
    _cascade_delete_user_data(client, user_id)
    client.auth.admin.delete_user(user_id)  # cascades the profiles row via FK


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(link_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    client.table("parent_child_link").delete().eq("id", link_id).execute()
