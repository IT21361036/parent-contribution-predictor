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

import random
import sys
from datetime import datetime, timezone

from app.db.supabase_client import get_service_client
from app.ml.engagement import ATTENTION_PLACEHOLDER, compute_pei

DEMO_TERM = "demo-2026-t1"
DEMO_PERIOD = "demo"
PREDICTION_TERM = "current"  # matches routers.predictions.TERM

# Simulated cohort used to demonstrate the engagement->performance relationship
# on the admin analytics scatter. Identified by email domain so --clear can
# remove them cleanly (they are demo accounts, not real students).
COHORT_DOMAIN = "ol-demo.local"
COHORT_SIZE = 12

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


def _cohort_sample(rng: random.Random):
    """A latent 'family involvement' factor drives BOTH the parental signals and
    the academic scores, with independent noise on each — so engagement and
    performance correlate positively but not perfectly (a believable scatter)."""
    latent = rng.random()
    n = lambda s: rng.uniform(-s, s)  # noqa: E731
    hours = max(0.0, round(latent * 9 + n(1.5), 1))
    checks = max(0.0, round(latent * 22 + n(4)))
    base = 40 + latent * 50
    assessment = max(20.0, min(99.0, round(base + n(9))))
    exam = max(20.0, min(99.0, round(base + n(9))))
    attendance = max(50.0, min(100.0, round(60 + latent * 38 + n(5))))
    return hours, checks, assessment, exam, attendance


def seed_cohort(client, n: int = COHORT_SIZE) -> None:
    """Create/refresh N simulated child accounts with correlated engagement +
    academic data, so the admin analytics scatter shows a clear (noisy) trend."""
    rng = random.Random(42)
    now = datetime.now(timezone.utc).isoformat()
    made = 0
    for i in range(1, n + 1):
        email = f"demo.student.{i:02d}@{COHORT_DOMAIN}"
        name = f"Demo Student {i:02d}"
        existing = client.table("profiles").select("id").eq("email", email).execute().data
        if existing:
            cid = existing[0]["id"]
        else:
            try:
                created = client.auth.admin.create_user(
                    {
                        "email": email,
                        "password": f"DemoPw!{i:04d}",
                        "email_confirm": True,
                        "user_metadata": {"full_name": name},
                    }
                )
                cid = created.user.id
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {email}: {str(exc)[:60]}")
                continue
        client.table("profiles").upsert(
            {"id": cid, "role": "child", "full_name": name, "email": email, "grade_level": "Grade 11"}
        ).execute()

        hours, checks, assessment, exam, attendance = _cohort_sample(rng)
        client.table("academic_records").delete().eq("child_id", cid).eq("term", DEMO_TERM).execute()
        client.table("academic_records").insert(
            {"child_id": cid, "term": DEMO_TERM, "assessment_score": assessment, "exam_score": exam, "attendance_pct": attendance}
        ).execute()
        pei = compute_pei(hours, checks, ATTENTION_PLACEHOLDER)
        client.table("engagement_index").delete().eq("child_id", cid).eq("period", DEMO_PERIOD).execute()
        client.table("engagement_index").insert(
            {
                "child_id": cid,
                "period": DEMO_PERIOD,
                "monitoring_hours": hours,
                "check_frequency": checks,
                "avg_attention_score": ATTENTION_PLACEHOLDER,
                "engagement_index": pei,
                "computed_at": now,
            }
        ).execute()
        made += 1
    print(f"Seeded {made} simulated cohort student(s) (@{COHORT_DOMAIN}).")
    print("Next: POST /predictions/run (as admin) to colour them by risk band.")


def clear_cohort(client) -> None:
    kids = client.table("profiles").select("id").like("email", f"%@{COHORT_DOMAIN}").execute().data
    for k in kids:
        client.table("academic_records").delete().eq("child_id", k["id"]).execute()
        client.table("engagement_index").delete().eq("child_id", k["id"]).execute()
        client.table("predictions").delete().eq("child_id", k["id"]).execute()
        try:
            client.auth.admin.delete_user(k["id"])
        except Exception:  # noqa: BLE001
            pass
    print(f"Cleared {len(kids)} simulated cohort student(s).")


def main() -> None:
    client = get_service_client()
    if "--clear" in sys.argv:
        clear_demo(client)
        clear_cohort(client)
    elif "--cohort" in sys.argv:
        idx = sys.argv.index("--cohort")
        size = int(sys.argv[idx + 1]) if idx + 1 < len(sys.argv) and sys.argv[idx + 1].isdigit() else COHORT_SIZE
        seed_cohort(client, size)
    else:
        seed(client)


if __name__ == "__main__":
    main()
