"""Admin student-centric views: the risk-sorted roster and the per-student
detail aggregate + intervention notes. Admin-only; all access via the
service-role client (RLS-vs-API golden rule)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/admin/students", tags=["students"])

require_admin = require_role("admin")

# High surfaces first — at-risk students go to the top of the roster.
_BAND_ORDER = {"high": 0, "medium": 1, "low": 2}


class NoteRequest(BaseModel):
    body: str


class AssignSubjectsRequest(BaseModel):
    subject_ids: list[str]


def _get_child_or_404(client, child_id: str) -> dict:
    """Fetch a profile and confirm it is a child; 404 otherwise.

    Uses maybe_single() so a missing id returns data=None (not a raised
    postgrest error), letting the 404 guard fire instead of 500-ing.
    """
    profile = (
        client.table("profiles").select("*").eq("id", child_id).maybe_single().execute().data
    )
    if not profile or profile["role"] != "child":
        raise HTTPException(status_code=404, detail="Child not found")
    return profile


# NOTE: /roster MUST be declared before /{child_id} — FastAPI matches routes in
# declaration order, so a literal path has to precede the parameterised one or
# GET /admin/students/roster would bind child_id="roster".
@router.get("/roster")
def student_roster(_: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    children = (
        client.table("profiles")
        .select("id, full_name, grade_level")
        .eq("role", "child")
        .execute()
        .data
    )
    rows = []
    for c in children:
        pred = (
            client.table("predictions")
            .select("risk_band, risk_score, generated_at")
            .eq("child_id", c["id"])
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        act = (
            client.table("student_activity")
            .select("created_at")
            .eq("child_id", c["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        p = pred[0] if pred else None
        rows.append(
            {
                "child_id": c["id"],
                "full_name": c["full_name"],
                "grade_level": c["grade_level"],
                "risk_band": p["risk_band"] if p else None,
                "risk_score": p["risk_score"] if p else None,
                "generated_at": p["generated_at"] if p else None,
                "last_activity_at": act[0]["created_at"] if act else None,
            }
        )
    # Sort by band (high->medium->low; unpredicted last), then risk_score desc.
    rows.sort(key=lambda r: (_BAND_ORDER.get(r["risk_band"], 3), -(r["risk_score"] or 0)))
    return rows


@router.get("/{child_id}")
def student_detail(child_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    profile = _get_child_or_404(client, child_id)

    academics = (
        client.table("academic_records")
        .select("*")
        .eq("child_id", child_id)
        .order("term")
        .execute()
        .data
    )
    activity = (
        client.table("student_activity")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
    )
    attempts = (
        client.table("quiz_attempts")
        .select("*")
        .eq("child_id", child_id)
        .order("submitted_at", desc=True)
        .execute()
        .data
    )
    return {"profile": profile, "academics": academics, "activity": activity, "attempts": attempts}


@router.get("/{child_id}/notes")
def list_notes(child_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    _get_child_or_404(client, child_id)
    notes = (
        client.table("intervention_notes")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    author_ids = list({n["author_id"] for n in notes})
    names: dict[str, str | None] = {}
    if author_ids:
        authors = (
            client.table("profiles").select("id, full_name").in_("id", author_ids).execute().data
        )
        names = {a["id"]: a["full_name"] for a in authors}
    for n in notes:
        n["author_name"] = names.get(n["author_id"])
    return notes


@router.post("/{child_id}/notes", status_code=status.HTTP_201_CREATED)
def create_note(child_id: str, body: NoteRequest, admin: CurrentUser = Depends(require_admin)):
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note body cannot be empty")
    client = get_service_client()
    _get_child_or_404(client, child_id)
    result = (
        client.table("intervention_notes")
        .insert({"child_id": child_id, "author_id": admin.id, "body": text})
        .execute()
    )
    return result.data[0]


@router.get("/{child_id}/subjects")
def get_student_subjects(child_id: str, _: CurrentUser = Depends(require_admin)):
    """Everything the admin UI needs: the automatic core list, the optional
    subjects on offer, and which of those this student is assigned."""
    client = get_service_client()
    _get_child_or_404(client, child_id)

    subjects = client.table("subjects").select("*").order("name").execute().data or []
    assigned = (
        client.table("child_subjects")
        .select("subject_id")
        .eq("child_id", child_id)
        .execute()
        .data
        or []
    )
    return {
        "core": [s for s in subjects if s["is_core"]],
        "optional": [s for s in subjects if not s["is_core"]],
        "assigned_ids": [a["subject_id"] for a in assigned],
    }


@router.put("/{child_id}/subjects")
def set_student_subjects(
    child_id: str,
    body: AssignSubjectsRequest,
    admin: CurrentUser = Depends(require_admin),
):
    """Replace this student's optional subjects with exactly the ids supplied.

    Replace-semantics (rather than add/remove endpoints) matches the admin
    checkbox form, which saves the whole set in one request.
    """
    client = get_service_client()
    _get_child_or_404(client, child_id)

    ids = body.subject_ids
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Duplicate subject ids in request")

    if ids:
        found = client.table("subjects").select("id, is_core").in_("id", ids).execute().data or []
        by_id = {s["id"]: s for s in found}
        missing = [i for i in ids if i not in by_id]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown subject ids: {missing}")
        if any(by_id[i]["is_core"] for i in ids):
            raise HTTPException(
                status_code=400,
                detail="Core subjects are automatic for every student and cannot be assigned",
            )

    client.table("child_subjects").delete().eq("child_id", child_id).execute()
    if ids:
        client.table("child_subjects").insert(
            [
                {"child_id": child_id, "subject_id": sid, "assigned_by": admin.id}
                for sid in ids
            ]
        ).execute()
    return {"assigned_ids": ids}
