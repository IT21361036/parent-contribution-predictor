"""Which subjects a given child may see.

Core subjects are taken by every O/L student; optional (elective) subjects are
assigned per child in ``child_subjects``. Only the ``child`` role is gated —
admins and parents are never filtered.

The gate lives here in Python rather than in an RLS policy because every read
goes through the service-role client, which bypasses RLS by design (the
RLS-vs-API golden rule at the top of schema.sql).
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser


def core_subject_ids(client) -> set[str]:
    """Ids of subjects every student takes."""
    rows = client.table("subjects").select("id").eq("is_core", True).execute().data or []
    return {r["id"] for r in rows}


def assigned_subject_ids(client, child_id: str) -> set[str]:
    """Ids of the optional subjects this child has been assigned."""
    rows = (
        client.table("child_subjects")
        .select("subject_id")
        .eq("child_id", child_id)
        .execute()
        .data
        or []
    )
    return {r["subject_id"] for r in rows}


def allowed_subject_ids(client, child_id: str) -> set[str]:
    """Every subject id this child may see: core plus their own optionals."""
    return core_subject_ids(client) | assigned_subject_ids(client, child_id)


def assert_subject_allowed(client, user: CurrentUser, subject_id: str | None) -> None:
    """Raise 403 if a child asked for a subject outside their set.

    A ``None`` subject_id means the caller supplied no subject filter — list
    endpoints filter their rows instead, so there is nothing to assert.
    """
    if user.role != "child" or subject_id is None:
        return
    if subject_id not in allowed_subject_ids(client, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This subject is not one of yours.",
        )
