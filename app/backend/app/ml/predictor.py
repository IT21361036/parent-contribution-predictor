"""Serving layer for the performance-risk predictor.

Loads the versioned model + its sidecar meta once, assembles a child's feature
vector from our own tables in the meta's frozen feature order, and returns an
explainable prediction: a risk band, a confidence, and the top contributing
factors annotated with the child's own values and direction.

The model is loaded lazily and cached, so importing this module is cheap and
the app still starts if the model file is briefly absent (the error surfaces
only when a prediction is actually requested).
"""

from __future__ import annotations

import json
from functools import lru_cache

import joblib
import pandas as pd

from app.ml._paths import MODEL_META, MODEL_PKL
from app.ml.features import FEATURE_LABEL, FEATURE_MIDPOINT, FEATURES, PROTECTIVE

TOP_K_FACTORS = 4


@lru_cache
def _load():
    if not MODEL_PKL.exists() or not MODEL_META.exists():
        raise RuntimeError(
            f"Model not found ({MODEL_PKL.name}). Run `python -m app.ml.train_predictor` first."
        )
    model = joblib.load(MODEL_PKL)
    meta = json.loads(MODEL_META.read_text())
    return model, meta


def model_meta() -> dict:
    """Expose the sidecar meta (metrics, importances, provenance) for a
    model-health/admin view without loading it twice."""
    return _load()[1]


def _mean(values: list) -> float:
    nums = [float(v) for v in values if v is not None]
    return sum(nums) / len(nums) if nums else 0.0


def build_features(client, child_id: str) -> dict[str, float]:
    """Assemble the feature vector for one child from our tables. Missing
    signals default to 0 (a child with no data reads as low-engagement, which
    correctly surfaces as elevated risk) except parental_attention, which uses
    the neutral 0.5 placeholder until the Phase 7 camera exists.
    """
    attempts = client.table("quiz_attempts").select("score, max_score").eq("child_id", child_id).execute().data
    ratios = [
        float(a["score"]) / float(a["max_score"])
        for a in attempts
        if a.get("score") is not None and a.get("max_score")
    ]

    activity = client.table("student_activity").select("watch_percent").eq("child_id", child_id).execute().data

    records = (
        client.table("academic_records")
        .select("assessment_score, exam_score, attendance_pct")
        .eq("child_id", child_id)
        .execute()
        .data
    )
    prior_scores = [r["assessment_score"] for r in records] + [r["exam_score"] for r in records]

    engagement = (
        client.table("engagement_index")
        .select("monitoring_hours, check_frequency, avg_attention_score")
        .eq("child_id", child_id)
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    eng = engagement[0] if engagement else {}

    features = {
        "quiz_avg_pct": round(_mean(ratios), 4),
        "quiz_count": float(len(attempts)),
        "material_activity": float(len(activity)),
        "avg_watch_percent": round(_mean([a.get("watch_percent") for a in activity]), 2),
        "attendance_pct": round(_mean([r.get("attendance_pct") for r in records]), 2),
        "prior_avg_score": round(_mean(prior_scores), 2),
        "monitoring_hours": float(eng.get("monitoring_hours") or 0.0),
        "check_frequency": float(eng.get("check_frequency") or 0.0),
        "parental_attention": float(eng.get("avg_attention_score") or 0.5),
    }
    return features


def _top_factors(features: dict[str, float], importances: dict[str, float]) -> list[dict]:
    """Top-k features by the model's global importance, each annotated with
    this child's value and whether it raises or lowers their risk."""
    ranked = sorted(FEATURES, key=lambda f: importances.get(f, 0.0), reverse=True)[:TOP_K_FACTORS]
    factors = []
    for f in ranked:
        value = features[f]
        below = value < FEATURE_MIDPOINT[f]
        # Protective feature (higher = safer): low value raises risk.
        raises_risk = below if PROTECTIVE[f] else not below
        level = "low" if below else "high"
        factors.append(
            {
                "feature": f,
                "label": FEATURE_LABEL[f],
                "value": round(value, 2),
                "importance": round(importances.get(f, 0.0), 4),
                "direction": "raises" if raises_risk else "lowers",
                "explanation": f"{FEATURE_LABEL[f]} is {level} → {'raises' if raises_risk else 'lowers'} risk",
            }
        )
    return factors


def predict(client, child_id: str) -> dict:
    """Explainable risk prediction for one child."""
    model, meta = _load()
    features = build_features(client, child_id)

    # Build a single-row DataFrame with the frozen column names so the model
    # sees the same feature names it was fitted on (no sklearn name warning).
    order = meta["feature_order"]
    vector = pd.DataFrame([[features[f] for f in order]], columns=order)
    proba = model.predict_proba(vector)[0]
    classes = list(model.classes_)
    top_idx = int(proba.argmax())
    risk_band = classes[top_idx]
    risk_score = round(float(proba[top_idx]), 4)

    return {
        "child_id": child_id,
        "model_version": meta["version"],
        "risk_band": risk_band,
        "risk_score": risk_score,
        "class_probabilities": {cls: round(float(p), 4) for cls, p in zip(classes, proba)},
        "top_factors": _top_factors(features, meta["feature_importances"]),
        "features": features,
    }
