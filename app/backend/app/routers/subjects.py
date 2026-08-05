from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, get_current_user, require_role
from app.db.supabase_client import get_service_client
from app.services.subject_access import allowed_subject_ids

router = APIRouter(prefix="/subjects", tags=["subjects"])

require_content_author = require_role("admin")


class CreateSubjectRequest(BaseModel):
    name: str
    grade_level: str | None = None
    # Core subjects are taken by every student. Optional (elective) ones are
    # assigned per child by an admin.
    is_core: bool = True


class UpdateSubjectRequest(BaseModel):
    name: str | None = None
    grade_level: str | None = None
    is_core: bool | None = None


@router.get("")
def list_subjects(user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    subjects = client.table("subjects").select("*").order("name").execute().data or []

    # A child sees the core subjects plus only their own assigned optionals.
    if user.role == "child":
        allowed = allowed_subject_ids(client, user.id)
        subjects = [s for s in subjects if s["id"] in allowed]
    return subjects


@router.post("", status_code=201)
def create_subject(body: CreateSubjectRequest, _: CurrentUser = Depends(require_content_author)):
    client = get_service_client()
    result = (
        client.table("subjects")
        .insert({"name": body.name, "grade_level": body.grade_level, "is_core": body.is_core})
        .execute()
    )
    return result.data[0]


@router.patch("/{subject_id}")
def update_subject(
    subject_id: str,
    body: UpdateSubjectRequest,
    _: CurrentUser = Depends(require_content_author),
):
    """Rename a subject or reclassify it as core/optional.

    exclude_unset (not a None-filter) so grade_level can be explicitly nulled,
    matching PATCH /admin/users/{id}.
    """
    client = get_service_client()
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = client.table("subjects").update(changes).eq("id", subject_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    # A core subject is implicit for every child, so stored assignments become
    # meaningless — and would silently return if it were flipped optional again.
    if changes.get("is_core") is True:
        client.table("child_subjects").delete().eq("subject_id", subject_id).execute()

    return result.data[0]
