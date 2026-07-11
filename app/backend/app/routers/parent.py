from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client
from app.routers.activity import with_material_titles
from app.routers.quizzes import with_quiz_titles

router = APIRouter(prefix="/parent", tags=["parent"])

require_parent = require_role("parent")

PING_KINDS = {"page_view", "history_check"}


class StartSessionRequest(BaseModel):
    child_id: str


class PingSessionRequest(BaseModel):
    kind: str  # 'page_view' | 'history_check'


class AttentionRequest(BaseModel):
    # The camera runs entirely in the browser; only these computed numbers are
    # ever sent — no video/frames. Phase 7 (parent attention verification).
    attentive_seconds: int
    total_seconds: int
    liveness_passed: bool


def _assert_linked(client, parent_id: str, child_id: str) -> None:
    link = (
        client.table("parent_child_link")
        .select("id")
        .eq("parent_id", parent_id)
        .eq("child_id", child_id)
        .execute()
        .data
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not linked to this child")


@router.get("/children")
def list_children(user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    links = client.table("parent_child_link").select("*").eq("parent_id", user.id).execute().data
    if not links:
        return []

    child_ids = [link["child_id"] for link in links]
    profiles = client.table("profiles").select("*").in_("id", child_ids).execute().data
    profiles_by_id = {p["id"]: p for p in profiles}

    return [
        {
            "link_id": link["id"],
            "child_id": link["child_id"],
            "relationship": link["relationship"],
            "full_name": profiles_by_id.get(link["child_id"], {}).get("full_name"),
            "grade_level": profiles_by_id.get(link["child_id"], {}).get("grade_level"),
        }
        for link in links
    ]


@router.get("/children/{child_id}/activity")
def child_activity(child_id: str, user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    _assert_linked(client, user.id, child_id)
    result = (
        client.table("student_activity")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .execute()
    )
    return with_material_titles(client, result.data)


@router.get("/children/{child_id}/quiz-attempts")
def child_quiz_attempts(child_id: str, user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    _assert_linked(client, user.id, child_id)
    result = (
        client.table("quiz_attempts")
        .select("*")
        .eq("child_id", child_id)
        .order("submitted_at", desc=True)
        .execute()
    )
    return with_quiz_titles(client, result.data)


@router.get("/sessions")
def list_sessions(user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    result = (
        client.table("monitoring_sessions")
        .select("*")
        .eq("parent_id", user.id)
        .order("started_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/attention-history")
def attention_history(user: CurrentUser = Depends(require_parent)):
    """Every past attention-verification run for this parent, newest first, with
    the child's name attached — a persistent log so a parent who forgets can see
    how much they've been observing over time."""
    client = get_service_client()
    sessions = (
        client.table("monitoring_sessions")
        .select("id, child_id, started_at")
        .eq("parent_id", user.id)
        .execute()
        .data
    )
    if not sessions:
        return []

    by_id = {s["id"]: s for s in sessions}
    scores = (
        client.table("attention_scores")
        .select("*")
        .in_("session_id", list(by_id))
        .order("computed_at", desc=True)
        .execute()
        .data
    )
    child_ids = list({s["child_id"] for s in sessions})
    profiles = client.table("profiles").select("id, full_name").in_("id", child_ids).execute().data
    names = {p["id"]: p.get("full_name") for p in profiles}

    out = []
    for sc in scores:
        sess = by_id.get(sc["session_id"])
        if not sess:
            continue
        out.append(
            {
                "id": sc["id"],
                "child_id": sess["child_id"],
                "child_name": names.get(sess["child_id"]),
                "attention_score": sc.get("attention_score"),
                "attentive_seconds": sc.get("attentive_seconds"),
                "total_seconds": sc.get("total_seconds"),
                "recorded_at": sc.get("computed_at") or sess.get("started_at"),
            }
        )
    return out


@router.post("/sessions", status_code=201)
def start_session(body: StartSessionRequest, user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    _assert_linked(client, user.id, body.child_id)
    result = client.table("monitoring_sessions").insert({"parent_id": user.id, "child_id": body.child_id}).execute()
    return result.data[0]


@router.post("/sessions/{session_id}/ping")
def ping_session(session_id: str, body: PingSessionRequest, user: CurrentUser = Depends(require_parent)):
    if body.kind not in PING_KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {sorted(PING_KINDS)}")

    client = get_service_client()
    session = (
        client.table("monitoring_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("parent_id", user.id)
        .single()
        .execute()
        .data
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    column = "pages_viewed" if body.kind == "page_view" else "history_checks"
    result = (
        client.table("monitoring_sessions").update({column: session[column] + 1}).eq("id", session_id).execute()
    )
    return result.data[0]


@router.post("/sessions/{session_id}/end")
def end_session(session_id: str, user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    session = (
        client.table("monitoring_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("parent_id", user.id)
        .single()
        .execute()
        .data
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = (
        client.table("monitoring_sessions")
        .update({"ended_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", session_id)
        .execute()
    )
    return result.data[0]


@router.post("/sessions/{session_id}/attention", status_code=201)
def record_attention(session_id: str, body: AttentionRequest, user: CurrentUser = Depends(require_parent)):
    """Store the browser-computed parental attention for a session (Phase 7, A+E).

    Writes numbers only — the raw video never leaves the parent's device. The
    engagement scorer (`app.ml.engagement._latest_attention`) already averages
    these `attention_scores` rows, so no change is needed there.
    """
    if body.total_seconds <= 0:
        raise HTTPException(status_code=400, detail="total_seconds must be positive")
    if not 0 <= body.attentive_seconds <= body.total_seconds:
        raise HTTPException(status_code=400, detail="attentive_seconds must be between 0 and total_seconds")

    client = get_service_client()
    session = (
        client.table("monitoring_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("parent_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    score = round(body.attentive_seconds / body.total_seconds, 4)
    row = (
        client.table("attention_scores")
        .insert(
            {
                "session_id": session_id,
                "attention_score": score,
                "attentive_seconds": body.attentive_seconds,
                "total_seconds": body.total_seconds,
            }
        )
        .execute()
        .data[0]
    )
    # Mark that the camera ran and record the liveness result on the session.
    client.table("monitoring_sessions").update(
        {"camera_enabled": True, "liveness_passed": body.liveness_passed}
    ).eq("id", session_id).execute()
    return row
