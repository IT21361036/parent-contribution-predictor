"""Read-only diagnostic for an empty admin **Insights** scatter.

Why this exists: the Insights chart is the one screen whose data the portal UI
never produces. A dot is plotted only for a child who has BOTH

  * a row in `engagement_index`  (the parental engagement axis), and
  * a row in `academic_records`  with an assessment or exam score (the
    performance axis),

and the frontend hides the chart entirely below 2 such children. Neither table
is written by anything in the app — creating users, subjects, materials,
quizzes and attempts through the portal touches none of it. Only
`app.scripts.seed_demo` fills them. So "I have loads of data and the chart is
still empty" is the expected outcome, not a bug, and this script says so out
loud instead of leaving you guessing.

Read-only: it never writes, so it is safe to run against any database.

Usage (from app\\backend, venv active):
  python -m app.scripts.diagnose_insights
"""

from __future__ import annotations

from collections import defaultdict

from app.db.supabase_client import get_service_client

# Tables worth counting for context — a mismatch here is usually the giveaway
# (e.g. plenty of quiz_attempts but zero academic_records).
CONTEXT_TABLES = (
    "quiz_attempts",
    "student_activity",
    "monitoring_sessions",
    "learning_materials",
    "subjects",
)


def _latest(rows: list[dict], key: str, ts_field: str) -> dict[str, dict]:
    """Most recent row per `key` — same rule the endpoint uses."""
    out: dict[str, dict] = {}
    for r in rows:
        k = r[key]
        cur = out.get(k)
        if cur is None or (r.get(ts_field) or "") > (cur.get(ts_field) or ""):
            out[k] = r
    return out


def main() -> None:
    client = get_service_client()

    children = client.table("profiles").select("id, full_name, email").eq("role", "child").execute().data
    eng_rows = client.table("engagement_index").select("child_id, engagement_index, computed_at").execute().data
    acad_rows = client.table("academic_records").select("child_id, assessment_score, exam_score").execute().data
    pred_rows = client.table("predictions").select("child_id, risk_band, generated_at").execute().data

    print("=" * 68)
    print("ROW COUNTS")
    print("=" * 68)
    print(f"  profiles (role=child)   : {len(children)}")
    print(f"  engagement_index        : {len(eng_rows)}   <- engagement axis")
    print(f"  academic_records        : {len(acad_rows)}   <- performance axis")
    print(f"  predictions             : {len(pred_rows)}   <- dot colour only")
    for table in CONTEXT_TABLES:
        try:
            count: object = len(client.table(table).select("id").execute().data)
        except Exception as exc:  # noqa: BLE001 - report, don't abort the report
            count = f"ERROR {str(exc)[:44]}"
        print(f"  {table:<24}: {count}")

    eng_latest = _latest([r for r in eng_rows if r.get("engagement_index") is not None], "child_id", "computed_at")
    band_latest = _latest(pred_rows, "child_id", "generated_at")

    pct_n: dict[str, int] = defaultdict(int)
    for a in acad_rows:
        if any(v is not None for v in (a.get("assessment_score"), a.get("exam_score"))):
            pct_n[a["child_id"]] += 1

    print()
    print("=" * 68)
    print("PER-CHILD  (needs BOTH axes to become a dot)")
    print("=" * 68)
    plotted = 0
    for child in children:
        cid = child["id"]
        missing = []
        if cid not in eng_latest:
            missing.append("no engagement_index")
        if pct_n.get(cid, 0) == 0:
            missing.append("no academic_records score")
        ok = not missing
        plotted += ok
        band = (band_latest.get(cid) or {}).get("risk_band") or "-"
        print(
            f"  [{'PLOT' if ok else 'skip'}] {(child.get('full_name') or '?')[:24]:<24} "
            f"{(child.get('email') or '')[:30]:<30} band={band:<7} {' | '.join(missing)}"
        )

    print()
    print("=" * 68)
    print("VERDICT")
    print("=" * 68)
    print(f"  plottable points = {plotted}  (the chart needs at least 2)")
    if plotted >= 2:
        print("  The chart SHOULD render. If the screen is still empty, the cause is")
        print("  outside the data: check the backend terminal for a traceback, and")
        print("  the browser Network tab for GET /admin/analytics/engagement-performance.")
        print("  A wrong VITE_API_URL or a different Supabase project also looks like this.")
    else:
        print("  The chart shows 'Not enough data yet'.")
        print()
        print("  Fix — from app\\backend with the venv active:")
        print("    python -m app.scripts.seed_demo --cohort 12")
        print("  then log in as admin -> Risk Predictions -> 'Run predictions'")
        print("  to colour the dots by risk band. Re-run this script to confirm.")


if __name__ == "__main__":
    main()
