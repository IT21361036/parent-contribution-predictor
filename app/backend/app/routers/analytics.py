"""Admin analytics — cohort-level views that surface the project's core research
relationship: parental engagement vs student performance. Admin-only; all access
via the service-role client (RLS-vs-API golden rule)."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/admin/analytics", tags=["analytics"])

require_admin = require_role("admin")


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    """Pearson correlation coefficient, or None when it's undefined (n<2 or a
    zero-variance axis)."""
    n = len(xs)
    if n < 2:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = sum((x - mx) ** 2 for x in xs)
    dy = sum((y - my) ** 2 for y in ys)
    if dx == 0 or dy == 0:
        return None
    return num / (dx**0.5 * dy**0.5)


def _latest(rows: list[dict], key: str, ts_field: str) -> dict[str, dict]:
    """Keep the most recent row per `key` (by `ts_field`, string-comparable ISO)."""
    out: dict[str, dict] = {}
    for r in rows:
        k = r[key]
        cur = out.get(k)
        if cur is None or (r.get(ts_field) or "") > (cur.get(ts_field) or ""):
            out[k] = r
    return out


@router.get("/engagement-performance")
def engagement_performance(_: CurrentUser = Depends(require_admin)):
    """One point per student — parental engagement index (x) vs the student's
    average quiz score % (y) — plus the Pearson r across the cohort. This is the
    thesis on screen: association, not causation.
    """
    client = get_service_client()
    children = client.table("profiles").select("id, full_name").eq("role", "child").execute().data

    eng_latest = _latest(
        [r for r in client.table("engagement_index")
         .select("child_id, engagement_index, computed_at").execute().data
         if r.get("engagement_index") is not None],
        "child_id", "computed_at",
    )
    band_latest = _latest(
        client.table("predictions").select("child_id, risk_band, generated_at").execute().data,
        "child_id", "generated_at",
    )

    # Performance = mean of a child's academic scores (assessment/exam) across
    # their records. Academic records are what the demo cohort is seeded with,
    # and grades are the thesis's real performance signal.
    pct_sum: dict[str, float] = defaultdict(float)
    pct_n: dict[str, int] = defaultdict(int)
    for a in client.table("academic_records").select("child_id, assessment_score, exam_score").execute().data:
        vals = [v for v in (a.get("assessment_score"), a.get("exam_score")) if v is not None]
        if vals:
            pct_sum[a["child_id"]] += sum(vals) / len(vals)
            pct_n[a["child_id"]] += 1

    points = []
    for c in children:
        cid = c["id"]
        eng = eng_latest.get(cid)
        if not eng or pct_n.get(cid, 0) == 0:
            continue  # need both axes for a correlation point
        points.append(
            {
                "child_id": cid,
                "name": c.get("full_name"),
                "engagement": round((eng["engagement_index"] or 0) * 100, 1),
                "performance": round(pct_sum[cid] / pct_n[cid], 1),
                "risk_band": (band_latest.get(cid) or {}).get("risk_band"),
            }
        )

    r = _pearson([p["engagement"] for p in points], [p["performance"] for p in points])
    return {"points": points, "r": round(r, 3) if r is not None else None, "n": len(points)}
