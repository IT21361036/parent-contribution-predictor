"""Parental Engagement Index endpoint.

Same access model as predictions: admins see any child, parents only their
linked children. The PEI itself is the transparent formula in
`app.ml.engagement` — no model involved.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client
from app.ml import engagement

router = APIRouter(prefix="/engagement", tags=["engagement"])

require_parent_or_admin = require_role("parent", "admin")


def _assert_access(client, user: CurrentUser, child_id: str) -> None:
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


@router.get("/{child_id}")
def get_engagement(child_id: str, user: CurrentUser = Depends(require_parent_or_admin)):
    client = get_service_client()
    _assert_access(client, user, child_id)
    return engagement.get_engagement(client, child_id)


@router.get("/{child_id}/history")
def get_engagement_history(child_id: str, user: CurrentUser = Depends(require_parent_or_admin)):
    client = get_service_client()
    _assert_access(client, user, child_id)
    rows = (
        client.table("engagement_index")
        .select("period, engagement_index, computed_at")
        .eq("child_id", child_id)
        .order("computed_at", desc=False)  # oldest -> newest for a left-to-right trend
        .execute()
        .data
    )
    return rows
