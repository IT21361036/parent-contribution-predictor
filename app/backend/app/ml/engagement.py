"""Parental Engagement Index (PEI) — a transparent weighted formula, NOT a
machine-learning model (Research_Positioning.md).

    PEI = 0.4 * norm(monitoring_hours)
        + 0.3 * norm(check_frequency)
        + 0.3 * parental_attention        # 0.5 placeholder until the camera

Inputs come from `monitoring_sessions` (how long and how attentively a parent
watches). The result is upserted into `engagement_index`, which is also where
the performance predictor reads its parental features — so this scorer is both
a product surface and part of the model's feature pipeline.

Every term is inspectable; nothing here is learned.
"""

from __future__ import annotations

from datetime import datetime, timezone

# Normalisation caps. These match the ranges the training data was generated
# in (generate_simulated.NORM_RANGE) so a PEI computed here is comparable to
# the parental features the model was trained on.
MONITORING_HOURS_CAP = 10.0
CHECK_FREQUENCY_CAP = 25.0

# Weights of the three PEI components (must sum to 1).
W_MONITORING = 0.4
W_CHECKS = 0.3
W_ATTENTION = 0.3

ATTENTION_PLACEHOLDER = 0.5  # neutral until the Phase 7 camera lands


def _norm(value: float, cap: float) -> float:
    return max(0.0, min(1.0, value / cap)) if cap else 0.0


def compute_pei(monitoring_hours: float, check_frequency: float, parental_attention: float) -> float:
    """The formula, in one place, so serving and seeding agree exactly."""
    return round(
        W_MONITORING * _norm(monitoring_hours, MONITORING_HOURS_CAP)
        + W_CHECKS * _norm(check_frequency, CHECK_FREQUENCY_CAP)
        + W_ATTENTION * parental_attention,
        4,
    )


def _session_hours(session: dict) -> float:
    """Duration of one monitoring session in hours (0 if still open)."""
    started, ended = session.get("started_at"), session.get("ended_at")
    if not started or not ended:
        return 0.0
    start = datetime.fromisoformat(started)
    end = datetime.fromisoformat(ended)
    return max(0.0, (end - start).total_seconds() / 3600.0)


def _read_notifications_count(client, child_id: str) -> int:
    """How many notifications the child's linked parent(s) have READ.

    Folded into `check_frequency` below so that a parent responding to alerts
    (reading quiz-result / risk / report-card notifications) counts as
    involvement — same as a history check. This keeps the thesis model
    unchanged: no new ML feature, no retrain — responsiveness is simply another
    form of the existing check-ins signal.
    """
    links = (
        client.table("parent_child_link").select("parent_id").eq("child_id", child_id).execute().data
    )
    parent_ids = [link["parent_id"] for link in links]
    if not parent_ids:
        return 0
    rows = (
        client.table("notifications")
        .select("read_at")
        .in_("recipient_id", parent_ids)
        .execute()
        .data
    )
    return sum(1 for r in rows if r.get("read_at") is not None)


def _latest_attention(client, child_id: str) -> float:
    """Average attention score for the child's most recent session that has a
    camera reading. Until Phase 7 there are none, so this returns the neutral
    placeholder — keeping PEI well-defined today and camera-ready later.
    """
    sessions = (
        client.table("monitoring_sessions").select("id").eq("child_id", child_id).execute().data
    )
    session_ids = [s["id"] for s in sessions]
    if not session_ids:
        return ATTENTION_PLACEHOLDER
    scores = (
        client.table("attention_scores")
        .select("attention_score")
        .in_("session_id", session_ids)
        .execute()
        .data
    )
    values = [s["attention_score"] for s in scores if s.get("attention_score") is not None]
    return round(sum(values) / len(values), 4) if values else ATTENTION_PLACEHOLDER


def compute_for_child(client, child_id: str, period: str = "current") -> dict:
    """Compute PEI from the child's monitoring sessions and upsert the
    `engagement_index` row for (child, period). Returns the stored row."""
    sessions = (
        client.table("monitoring_sessions").select("*").eq("child_id", child_id).execute().data
    )
    monitoring_hours = round(sum(_session_hours(s) for s in sessions), 4)
    # Check-ins = explicit history checks during monitoring + notifications the
    # parent has read (responsiveness folded in — see _read_notifications_count).
    check_frequency = float(
        sum(s.get("history_checks", 0) or 0 for s in sessions)
        + _read_notifications_count(client, child_id)
    )
    attention = _latest_attention(client, child_id)
    pei = compute_pei(monitoring_hours, check_frequency, attention)

    row = {
        "child_id": child_id,
        "period": period,
        "monitoring_hours": monitoring_hours,
        "check_frequency": check_frequency,
        "avg_attention_score": attention,
        "engagement_index": pei,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }

    # No DB unique constraint on (child_id, period), so upsert by hand: update
    # the existing row for this period if present, otherwise insert.
    existing = (
        client.table("engagement_index")
        .select("id")
        .eq("child_id", child_id)
        .eq("period", period)
        .execute()
        .data
    )
    if existing:
        result = client.table("engagement_index").update(row).eq("id", existing[0]["id"]).execute()
    else:
        result = client.table("engagement_index").insert(row).execute()
    return result.data[0]


def latest_stored(client, child_id: str) -> dict | None:
    """Most recent engagement_index row for the child, or None."""
    rows = (
        client.table("engagement_index")
        .select("*")
        .eq("child_id", child_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def get_engagement(client, child_id: str) -> dict:
    """Product-facing read: if the child has monitoring sessions, (re)compute
    the index from them; otherwise fall back to the latest stored row (e.g.
    demo-seeded) so the endpoint never wipes real values with zeros.
    """
    sessions = (
        client.table("monitoring_sessions").select("id").eq("child_id", child_id).limit(1).execute().data
    )
    if sessions:
        return compute_for_child(client, child_id)

    stored = latest_stored(client, child_id)
    if stored:
        return stored

    # Nothing to show yet — return a well-formed zero index rather than 404,
    # so the UI can render "no engagement recorded" consistently.
    return {
        "child_id": child_id,
        "period": "current",
        "monitoring_hours": 0.0,
        "check_frequency": 0.0,
        "avg_attention_score": ATTENTION_PLACEHOLDER,
        "engagement_index": compute_pei(0.0, 0.0, ATTENTION_PLACEHOLDER),
        "computed_at": None,
    }
