"""Performance-risk prediction endpoints.

All ML and role logic lives here in FastAPI with the service-role client (the
project's RLS-vs-API golden rule): reads for a parent are gated by the same
linked-child check used elsewhere, and the batch recompute is admin-only.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client
from app.ml import predictor

router = APIRouter(prefix="/predictions", tags=["predictions"])

require_parent_or_admin = require_role("parent", "admin")
require_admin = require_role("admin")

TERM = "current"


def _assert_access(client, user: CurrentUser, child_id: str) -> None:
    """Admins see any child; a parent only their linked children."""
    if user.role == "admin":
        return
    link = (
        client.table("parent_child_link")
        .select("id")
        .eq("parent_id", user.id)
        .eq("child_id", child_id)
        .execute()
        .data
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not linked to this child")


def _store_prediction(client, pred: dict, term: str = TERM) -> dict:
    """Upsert-by-hand the predictions row for (child, term) — the table has no
    unique constraint, so we update in place rather than accrete rows."""
    row = {
        "child_id": pred["child_id"],
        "term": term,
        "model_version": pred["model_version"],
        "risk_band": pred["risk_band"],
        "risk_score": pred["risk_score"],
        "top_factors": pred["top_factors"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = (
        client.table("predictions")
        .select("id")
        .eq("child_id", pred["child_id"])
        .eq("term", term)
        .execute()
        .data
    )
    if existing:
        result = client.table("predictions").update(row).eq("id", existing[0]["id"]).execute()
    else:
        result = client.table("predictions").insert(row).execute()
    return result.data[0]


@router.get("/{child_id}")
def get_prediction(child_id: str, user: CurrentUser = Depends(require_parent_or_admin)):
    client = get_service_client()
    _assert_access(client, user, child_id)

    stored = (
        client.table("predictions")
        .select("*")
        .eq("child_id", child_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if stored:
        return stored[0]

    # Nothing stored yet — compute on demand, persist, and return it.
    pred = predictor.predict(client, child_id)
    return _store_prediction(client, pred)


@router.post("/run")
def run_predictions(_: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    children = client.table("profiles").select("id").eq("role", "child").execute().data

    predicted, failed = 0, []
    for child in children:
        try:
            pred = predictor.predict(client, child["id"])
            _store_prediction(client, pred)
            predicted += 1
        except Exception as exc:  # noqa: BLE001 — one bad child shouldn't abort the batch
            failed.append({"child_id": child["id"], "error": str(exc)})

    meta = predictor.model_meta()
    return {
        "predicted": predicted,
        "failed": failed,
        "model_version": meta["version"],
        "metrics": meta["metrics"],
    }
