"""The feature contract — the single source of truth shared by the offline
training pipeline and the online serving layer.

Positioning constraint (Research_Positioning.md): the model may only use
features our own database holds, so this list *is* the schema we simulate in.
The order here is frozen into the model's sidecar meta file at train time; at
serving time we rebuild the vector in exactly this order. Never reorder or
rename a feature without retraining.
"""

# Frozen feature order. Each entry documents its natural range so
# generation, normalisation and explanations all agree.
FEATURES: list[str] = [
    "quiz_avg_pct",       # mean quiz_attempts.score / max_score          (0..1)
    "quiz_count",         # count of quiz_attempts                        (0..N)
    "material_activity",  # count of student_activity rows                (0..N)
    "avg_watch_percent",  # mean student_activity.watch_percent           (0..100)
    "attendance_pct",     # academic_records.attendance_pct               (0..100)
    "prior_avg_score",    # mean of past assessment/exam scores           (0..100)
    "monitoring_hours",   # engagement_index.monitoring_hours (parental)  (0..~)
    "check_frequency",    # engagement_index.check_frequency (parental)   (0..~)
    "parental_attention",  # engagement_index.avg_attention_score         (0..1)
]

# Ordered risk classes, low → high. The trained model's own class order
# (model.classes_) is what serving trusts; this is the display/label order.
RISK_BANDS: list[str] = ["low", "medium", "high"]

# For every feature in our schema a *higher* value means a *lower* risk —
# more studying, more attendance, more parental involvement all protect the
# child. Explanations use this to phrase direction ("low → raises risk").
# (There are no risk-increasing features in the current schema, but keeping
# the map explicit means adding one later is a one-line change, not a bug.)
PROTECTIVE: dict[str, bool] = {f: True for f in FEATURES}

# Typical mid-points per feature, used only to decide whether a child's value
# is "low" or "high" relative to the population when phrasing explanations.
# These are rough reference points, not model parameters.
FEATURE_MIDPOINT: dict[str, float] = {
    "quiz_avg_pct": 0.55,
    "quiz_count": 5.0,
    "material_activity": 12.0,
    "avg_watch_percent": 55.0,
    "attendance_pct": 80.0,
    "prior_avg_score": 55.0,
    "monitoring_hours": 3.0,
    "check_frequency": 8.0,
    "parental_attention": 0.5,
}

# Human-readable labels for explanations shown to parents/admins.
FEATURE_LABEL: dict[str, str] = {
    "quiz_avg_pct": "quiz average",
    "quiz_count": "quizzes attempted",
    "material_activity": "material activity",
    "avg_watch_percent": "video watch %",
    "attendance_pct": "attendance",
    "prior_avg_score": "prior grades",
    "monitoring_hours": "parental monitoring hours",
    "check_frequency": "parental check-ins",
    "parental_attention": "parental attention score",
}
