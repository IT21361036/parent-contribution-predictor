"""In-app notification creation — the single place rows are written to the
`notifications` table.

Called from event hooks (quiz submit, prediction run, report-card upload) and
from the lazy quiz_due generator in the notifications router. All writes use the
service-role client (RLS-vs-API golden rule). There is no public create
endpoint: a notification only ever originates from a defined event.

Reading a notification (POST /notifications/{id}/read) sets `read_at`, which the
engagement scorer folds into `check_frequency` — no ML retrain.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

VALID_TYPES = {"quiz_result", "quiz_due", "report_card", "risk_alert"}


def linked_parent_ids(client, child_id: str) -> list[str]:
    """All parent profile ids linked to this child (a child may have several —
    e.g. twins share nothing, but two guardians can both be linked)."""
    links = (
        client.table("parent_child_link").select("parent_id").eq("child_id", child_id).execute().data
    )
    return [link["parent_id"] for link in links]


def child_name(client, child_id: str) -> str:
    prof = (
        client.table("profiles").select("full_name").eq("id", child_id).maybe_single().execute().data
    )
    return (prof or {}).get("full_name") or "your child"


def create_notification(
    client,
    *,
    recipient_id: str,
    type: str,
    title: str,
    body: str,
    child_id: str | None = None,
    related_id: str | None = None,
    dedup: bool = False,
    dedup_any_status: bool = False,
) -> dict | None:
    """Insert one notification row and return it.

    When ``dedup`` is True and ``related_id`` is set, skip (return None) if an
    *unread* notification of the same (recipient, type, related_id) already
    exists. When ``dedup_any_status`` is also True, skip if *any* copy exists
    (read or unread) — used by the lazy quiz_due generator, which runs on every
    GET, so a reminder that has been read isn't regenerated on the next load.
    """
    if dedup and related_id is not None:
        existing = (
            client.table("notifications")
            .select("id, read_at")
            .eq("recipient_id", recipient_id)
            .eq("type", type)
            .eq("related_id", related_id)
            .execute()
            .data
        )
        if dedup_any_status and existing:
            return None
        if any(e.get("read_at") is None for e in existing):
            return None

    row = {
        "recipient_id": recipient_id,
        "type": type,
        "title": title,
        "body": body,
        "child_id": child_id,
        "related_id": related_id,
    }
    return client.table("notifications").insert(row).execute().data[0]


# --- Event notifiers: one row per linked parent. -------------------------------
# Each is best-effort at the call site (a notification failure must never fail
# the underlying action — quiz submit, prediction run, upload). Callers wrap
# these in try/except; see notify_safe().


def notify_quiz_result(client, child_id: str, *, quiz_id: str, quiz_title: str, score, max_score) -> None:
    name = child_name(client, child_id)
    pct = round((score / max_score) * 100) if max_score else None
    pct_str = f" ({pct}%)" if pct is not None else ""
    for parent_id in linked_parent_ids(client, child_id):
        create_notification(
            client,
            recipient_id=parent_id,
            type="quiz_result",
            title="Quiz result available",
            body=f'{name} scored {score}/{max_score}{pct_str} on "{quiz_title}".',
            child_id=child_id,
            related_id=quiz_id,
        )


def notify_report_card(client, child_id: str, *, report_card_id: str, term: str) -> None:
    name = child_name(client, child_id)
    for parent_id in linked_parent_ids(client, child_id):
        create_notification(
            client,
            recipient_id=parent_id,
            type="report_card",
            title="New report card",
            body=f"A report card for {name} ({term}) is now available to view.",
            child_id=child_id,
            related_id=report_card_id,
        )


def notify_risk_alert(
    client, child_id: str, *, new_band: str, old_band: str | None, prediction_id: str | None = None
) -> None:
    name = child_name(client, child_id)
    moved = f"moved from {old_band} to {new_band}" if old_band else f"is now {new_band}"
    for parent_id in linked_parent_ids(client, child_id):
        create_notification(
            client,
            recipient_id=parent_id,
            type="risk_alert",
            title="Performance risk changed",
            body=(
                f"{name}'s predicted performance risk {moved}. "
                "This is a good moment to check in and offer support."
            ),
            child_id=child_id,
            related_id=prediction_id,
        )


def notify_safe(fn, *args, **kwargs) -> None:
    """Run a notifier without ever propagating its failure to the caller.

    A quiz submission / prediction run / upload must succeed even if writing the
    notification hits a transient DB error. The failure is logged, not swallowed
    silently.
    """
    try:
        fn(*args, **kwargs)
    except Exception:  # noqa: BLE001 — notifications are non-critical to the action
        logger.warning("notification hook failed", exc_info=True)
