"""Parent-facing in-app notifications.

Creation is internal only — event hooks in other routers plus the lazy
`quiz_due` generator here. There is no public POST to create one. Reading a
notification (POST /{id}/read) sets `read_at`, which the engagement scorer folds
into `check_frequency` (no ML retrain — see app/ml/engagement.py).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client
from app.services import notifications as notif

router = APIRouter(prefix="/notifications", tags=["notifications"])

require_parent = require_role("parent")

# How far ahead a quiz counts as "due soon". No cron in the prototype, so the
# reminders are generated lazily whenever the parent loads their notifications.
QUIZ_DUE_WINDOW_DAYS = 3
# Also remind about quizzes that are already past due but still unattempted
# (an overdue quiz is more worth nudging, not less). Bounded so ancient quizzes
# don't resurface forever.
QUIZ_OVERDUE_GRACE_DAYS = 30


def _parse_ts(value: str) -> datetime:
    """Parse a Postgres timestamptz string into an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _generate_quiz_due(client, parent_id: str) -> None:
    """Ensure a deduped, unread `quiz_due` notification for each linked child's
    quizzes that are due soon OR recently overdue and not yet attempted."""
    links = (
        client.table("parent_child_link").select("child_id").eq("parent_id", parent_id).execute().data
    )
    child_ids = [link["child_id"] for link in links]
    if not child_ids:
        return

    now = datetime.now(timezone.utc)
    earliest = now - timedelta(days=QUIZ_OVERDUE_GRACE_DAYS)  # recently overdue
    horizon = now + timedelta(days=QUIZ_DUE_WINDOW_DAYS)       # due soon

    quizzes = client.table("quizzes").select("id, title, due_date").execute().data
    relevant = []
    for q in quizzes:
        if not q.get("due_date"):
            continue
        due = _parse_ts(q["due_date"])
        if earliest <= due <= horizon:
            relevant.append((q, due))
    if not relevant:
        return

    for child_id in child_ids:
        attempts = (
            client.table("quiz_attempts").select("quiz_id").eq("child_id", child_id).execute().data
        )
        attempted = {a["quiz_id"] for a in attempts}
        name = notif.child_name(client, child_id)
        for q, due in relevant:
            if q["id"] in attempted:
                continue
            overdue = due < now
            notif.create_notification(
                client,
                recipient_id=parent_id,
                type="quiz_due",
                title="Quiz overdue" if overdue else "Quiz due soon",
                body=(
                    f'{name} has not yet attempted "{q["title"]}" — '
                    f'{"was due" if overdue else "due"} {due.date().isoformat()}.'
                ),
                child_id=child_id,
                related_id=q["id"],
                dedup=True,
                dedup_any_status=True,
            )


@router.get("")
def list_notifications(user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    _generate_quiz_due(client, user.id)
    items = (
        client.table("notifications")
        .select("*")
        .eq("recipient_id", user.id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    unread = sum(1 for n in items if n.get("read_at") is None)
    return {"items": items, "unread": unread}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, user: CurrentUser = Depends(require_parent)):
    """Mark one notification read (the engagement scoring hook). Parent must own
    it; already-read rows are returned unchanged (idempotent)."""
    client = get_service_client()
    row = (
        client.table("notifications")
        .select("*")
        .eq("id", notification_id)
        .eq("recipient_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")
    if row.get("read_at") is None:
        row = (
            client.table("notifications")
            .update({"read_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", notification_id)
            .execute()
            .data[0]
        )
    return row


@router.post("/read-all")
def mark_all_read(user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    rows = (
        client.table("notifications").select("id, read_at").eq("recipient_id", user.id).execute().data
    )
    ids = [r["id"] for r in rows if r.get("read_at") is None]
    if not ids:
        return {"updated": 0}
    client.table("notifications").update(
        {"read_at": datetime.now(timezone.utc).isoformat()}
    ).in_("id", ids).execute()
    return {"updated": len(ids)}
