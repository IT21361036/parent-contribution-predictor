"""Load and study the public education datasets that ground our simulation.

Why this exists (Research_Positioning.md): our data is *simulated on purpose*
— we can only train on features our own DB holds, and no public set ships in
that schema. So we don't train on the public data directly; we mine it for the
statistical relationships the literature relies on (parental involvement,
family support, attendance → performance) and reproduce those relationships in
a simulated Sri Lankan O/L dataset that lives in our own feature schema.

`study_relationships()` prints a short evidence summary (used in the thesis to
justify the simulation weights). `recast_xapi()` optionally maps real xAPI rows
into our schema so the training set can union `data_source='xapi'` rows with
the `simulated_sl` rows — demonstrating the recast pipeline end to end.

All framing is **association, not causation**.
"""

from __future__ import annotations

import io
import zipfile

import numpy as np
import pandas as pd

from app.ml._paths import STUDENT_PERF_ZIP, XAPI_CSV
from app.ml.features import FEATURES


def load_xapi() -> pd.DataFrame:
    """xAPI-Edu-Data: behavioural engagement columns + a 3-level `Class`
    (L/M/H) academic outcome."""
    return pd.read_csv(XAPI_CSV)


def load_student_performance() -> pd.DataFrame:
    """UCI Student Performance (Math). Semicolon-separated, quoted. G3 is the
    final grade on a 0–20 scale; absences, studytime, famsup, Medu/Fedu
    (parent education) are the involvement/attendance proxies."""
    with zipfile.ZipFile(STUDENT_PERF_ZIP) as z:
        raw = z.read("student-mat.csv")
    return pd.read_csv(io.BytesIO(raw), sep=";")


def study_relationships() -> dict:
    """Extract the correlations our simulation is grounded in and print a
    human-readable evidence summary. Returns the stats as a dict."""
    stats: dict = {}

    # ---- UCI student performance: what moves the final grade (G3)? ----
    perf = load_student_performance()
    perf = perf.copy()
    perf["famsup_bin"] = (perf["famsup"] == "yes").astype(int)
    perf["parent_edu"] = perf[["Medu", "Fedu"]].mean(axis=1)  # 0–4 scale
    corr_targets = {
        "family_support": "famsup_bin",
        "study_time": "studytime",
        "parent_education": "parent_edu",
        "absences": "absences",
        "past_failures": "failures",
    }
    perf_corr = {name: float(perf["G3"].corr(perf[col])) for name, col in corr_targets.items()}
    stats["uci_g3_correlations"] = perf_corr

    # ---- xAPI: outcome by parental survey participation & absence ----
    xapi = load_xapi()
    order = {"L": 0, "M": 1, "H": 2}
    xapi = xapi.copy()
    xapi["class_rank"] = xapi["Class"].map(order)
    by_survey = xapi.groupby("ParentAnsweringSurvey")["class_rank"].mean().to_dict()
    by_absence = xapi.groupby("StudentAbsenceDays")["class_rank"].mean().to_dict()
    engagement_corr = {
        "raisedhands": float(xapi["class_rank"].corr(xapi["raisedhands"])),
        "visited_resources": float(xapi["class_rank"].corr(xapi["VisITedResources"])),
    }
    stats["xapi_mean_outcome_by_parent_survey"] = {k: float(v) for k, v in by_survey.items()}
    stats["xapi_mean_outcome_by_absence"] = {k: float(v) for k, v in by_absence.items()}
    stats["xapi_engagement_correlations"] = engagement_corr

    print("=" * 64)
    print("Public-data evidence grounding the simulation (association only)")
    print("=" * 64)
    print(f"\nUCI Student Performance (n={len(perf)}) - correlation with final grade G3:")
    for name, val in perf_corr.items():
        arrow = "(higher grade)" if val >= 0 else "(lower grade)"
        print(f"  {name:<18} r = {val:+.3f}  {arrow}")
    print(f"\nxAPI-Edu-Data (n={len(xapi)}) - mean outcome rank (0=L .. 2=H):")
    print("  by parental survey participation:")
    for k, v in by_survey.items():
        print(f"    {k:<4} {v:.2f}")
    print("  by student absence days:")
    for k, v in by_absence.items():
        print(f"    {k:<10} {v:.2f}")
    print("  engagement correlations:")
    for k, v in engagement_corr.items():
        print(f"    {k:<18} r = {v:+.3f}")
    print()
    print("Takeaway: higher parental involvement / study effort / attendance")
    print("associate with better outcomes; more absences / prior failures with")
    print("worse. The simulator reproduces these directions in our schema.\n")

    return stats


def recast_xapi() -> pd.DataFrame:
    """Map real xAPI behavioural rows into our feature schema.

    We deliberately derive the *features* only from behavioural columns and
    take the risk label only from `Class`, so the outcome never leaks into the
    inputs. `parental_attention` is the neutral 0.5 placeholder (no camera in
    the public data). Tagged `data_source='xapi'`.
    """
    x = load_xapi().copy()

    absence_to_attendance = {"Under-7": 95.0, "Above-7": 72.0}
    # xAPI has no numeric parental-time signal; use the survey/satisfaction
    # flags as coarse proxies for our monitoring features.
    survey_yes = (x["ParentAnsweringSurvey"] == "Yes").astype(float)
    satisfaction_good = (x["ParentschoolSatisfaction"] == "Good").astype(float)

    out = pd.DataFrame()
    out["quiz_avg_pct"] = np.clip((x["raisedhands"] + x["VisITedResources"]) / 200.0, 0, 1)
    out["quiz_count"] = np.round(x["VisITedResources"] / 12.0).clip(0, 20)
    out["material_activity"] = (x["VisITedResources"] + x["AnnouncementsView"] + x["Discussion"]) / 3.0
    out["avg_watch_percent"] = x["VisITedResources"].clip(0, 100).astype(float)
    out["attendance_pct"] = x["StudentAbsenceDays"].map(absence_to_attendance).fillna(85.0)
    out["prior_avg_score"] = np.clip(40.0 + x["raisedhands"] * 0.4, 0, 100)
    out["monitoring_hours"] = survey_yes * 4.0 + 1.0
    out["check_frequency"] = satisfaction_good * 10.0 + survey_yes * 4.0 + 2.0
    out["parental_attention"] = 0.5  # camera placeholder

    class_to_risk = {"L": "high", "M": "medium", "H": "low"}
    out["risk_band"] = x["Class"].map(class_to_risk)
    out["data_source"] = "xapi"

    return out[FEATURES + ["risk_band", "data_source"]].dropna()


if __name__ == "__main__":
    study_relationships()
    recast = recast_xapi()
    print(f"recast_xapi(): {len(recast)} rows in feature schema")
    print(recast["risk_band"].value_counts().to_dict())
