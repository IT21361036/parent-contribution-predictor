"""Idempotent demo data so Phase 5 predictions render for existing child
accounts. This is how the simulated pipeline is demonstrated on real accounts.

Safety / idempotency (project habit — keep drives idempotent, never delete
data you can't cleanly identify): we only write to tables we can *tag* and
therefore safely clear on re-run —
  * academic_records  tagged  term   = DEMO_TERM
  * engagement_index  tagged  period = DEMO_PERIOD
We deliberately do NOT seed student_activity or monitoring_sessions, which have
no tag column — clearing them would risk real rows. build_features fills those
features with neutral defaults, and the seeded academic + parental signals are
what drive the risk-band spread anyway.

Usage:
  python -m app.scripts.seed_demo            # (re)seed demo data
  python -m app.scripts.seed_demo --clear    # remove demo data + predictions
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone

from app.db.supabase_client import get_service_client
from app.ml.engagement import ATTENTION_PLACEHOLDER, compute_pei

DEMO_TERM = "demo-2026-t1"
DEMO_PERIOD = "demo"
PREDICTION_TERM = "current"  # matches routers.predictions.TERM

# Three archetypes spread across the risk spectrum. Values are chosen so the
# trained model lands each archetype in (roughly) its intended band, driven by
# prior grades, attendance and parental involvement.
PROFILES = [
    {"name": "thriving", "attendance": 93.0, "assessment": 80.0, "exam": 78.0, "hours": 7.5, "checks": 18.0},
    {"name": "steady", "attendance": 80.0, "assessment": 62.0, "exam": 58.0, "hours": 3.5, "checks": 9.0},
    {"name": "at-risk", "attendance": 63.0, "assessment": 45.0, "exam": 40.0, "hours": 1.0, "checks": 3.0},
]


def _child_ids(client) -> list[str]:
    rows = client.table("profiles").select("id").eq("role", "child").order("created_at").execute().data
    return [r["id"] for r in rows]


def clear_demo(client) -> None:
    client.table("academic_records").delete().eq("term", DEMO_TERM).execute()
    client.table("engagement_index").delete().eq("period", DEMO_PERIOD).execute()
    client.table("predictions").delete().eq("term", PREDICTION_TERM).execute()
    print(f"Cleared demo academic_records ({DEMO_TERM}), engagement_index ({DEMO_PERIOD}), predictions ({PREDICTION_TERM}).")


def seed(client) -> None:
    child_ids = _child_ids(client)
    if not child_ids:
        print("No child accounts found — create some children first, then re-run.")
        return

    clear_demo(client)  # keep idempotent: wipe our tagged rows before re-inserting
    now = datetime.now(timezone.utc).isoformat()

    for i, child_id in enumerate(child_ids):
        p = PROFILES[i % len(PROFILES)]

        client.table("academic_records").insert(
            {
                "child_id": child_id,
                "term": DEMO_TERM,
                "assessment_score": p["assessment"],
                "exam_score": p["exam"],
                "attendance_pct": p["attendance"],
            }
        ).execute()

        pei = compute_pei(p["hours"], p["checks"], ATTENTION_PLACEHOLDER)
        client.table("engagement_index").insert(
            {
                "child_id": child_id,
                "period": DEMO_PERIOD,
                "monitoring_hours": p["hours"],
                "check_frequency": p["checks"],
                "avg_attention_score": ATTENTION_PLACEHOLDER,
                "engagement_index": pei,
                "computed_at": now,
            }
        ).execute()

        print(f"  seeded {child_id[:8]}… as '{p['name']}' (PEI={pei})")

    print(f"\nSeeded demo data for {len(child_ids)} child account(s).")
    print("Next: POST /predictions/run (as admin) to generate risk bands, then")
    print("view them in the parent and admin dashboards.")


def main() -> None:
    client = get_service_client()
    if "--clear" in sys.argv:
        clear_demo(client)
    else:
        seed(client)


if __name__ == "__main__":
    main()
