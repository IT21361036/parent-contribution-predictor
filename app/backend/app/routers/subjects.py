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


# Tables whose rows would be orphaned by deleting a subject, and the human name
# used in the refusal message. `child_subjects` is deliberately absent: its FK
# is ON DELETE CASCADE, so those assignments disappear cleanly and are not a
# reason to block.
# Plurals are spelled out rather than built with a trailing "s" — "quiz" would
# otherwise render as "2 quizs" in a message the admin actually reads.
_SUBJECT_REFERENCES = (
    ("learning_materials", "material", "materials"),
    ("quizzes", "quiz", "quizzes"),
    ("academic_records", "academic record", "academic records"),
)


def _plural(count: int, singular: str, plural: str) -> str:
    return f"{count} {singular if count == 1 else plural}"


@router.delete("/{subject_id}")
def delete_subject(subject_id: str, _: CurrentUser = Depends(require_content_author)):
    """Delete a subject, but only when nothing depends on it.

    The FKs from learning_materials / quizzes / academic_records to subjects
    carry no ON DELETE rule, so Postgres would reject the delete anyway — as a
    raw foreign-key violation surfacing to the admin as a 500. We count the
    references ourselves instead and refuse with a 409 that says exactly what is
    in the way, which is both a better message and the only version the test
    suite can exercise (the in-memory fake client enforces no constraints).
    """
    client = get_service_client()
    subject = (
        client.table("subjects").select("*").eq("id", subject_id).maybe_single().execute().data
    )
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    blockers = []
    total = 0
    for table, singular, plural in _SUBJECT_REFERENCES:
        rows = client.table(table).select("id").eq("subject_id", subject_id).execute().data or []
        if rows:
            total += len(rows)
            blockers.append(_plural(len(rows), singular, plural))

    if blockers:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete '{subject['name']}': {', '.join(blockers)} "
                f"still {'uses' if total == 1 else 'use'} it. Remove or reassign them first."
            ),
        )

    # Assignments of this optional subject cascade in Postgres; clear them here
    # too so the fake-client test path ends in the same state as production.
    client.table("child_subjects").delete().eq("subject_id", subject_id).execute()
    client.table("subjects").delete().eq("id", subject_id).execute()
    return {"deleted": subject_id}
