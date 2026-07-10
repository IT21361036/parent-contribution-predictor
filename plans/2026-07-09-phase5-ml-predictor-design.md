# Phase 5 — ML: Engagement Scorer + Performance Predictor — design (2026-07-09)

**Status:** ✅ BUILT (2026-07-09). See `Progress_Log.md` → "2026-07-09 (Phase 5
— ML)" and `../app/README.md` "Current status" for the as-built summary. This
document is the design of record; a couple of build-time decisions (below) were
resolved as noted.

_Original status:_ design approved by user; implementation deferred to a fresh
session (to keep context/cost lean).

**Build-time decisions (resolved):**
- Committed both `datasets/generated/training_data.csv` and the versioned
  `.pkl`/`.meta.json` (small, reproducible).
- PEI normalisation caps: `monitoring_hours`/10, `check_frequency`/25 (match the
  simulator's `NORM_RANGE`).
- Simulated risk-band thresholds on the 0..1 success score: ≥0.60 low, ≥0.42
  medium, else high.
- Seed generator seeds only the tag-cleanable tables (`academic_records`,
  `engagement_index`) for safe idempotency — see the Progress_Log note.

**Goal:** Build the app's intelligence layer — the one trained model of the
project. Predict each child's O/L performance **risk band** with an explainable
classical ML model, plus a transparent parental-**engagement** score. Exit
criteria (from `Implementation_Plan_Updated.md`): predictions *with explanations*
appear in the parent and admin dashboards.

## Positioning constraints (from `Research_Positioning.md` — must hold)

- **Explainability is the thesis argument.** Use a classical tree ensemble
  (**Random Forest**, optionally compare XGBoost) — never a black box. Expose
  feature importances as the "why".
- **Data is simulated on purpose.** We demonstrate the *method and pipeline*,
  framed as **association, not causation**. Every simulated row tagged
  `data_source`.
- **Engagement scorer is a transparent weighted formula, not ML.**
- **Serving constraint:** the model may only use features our own DB holds, so a
  model trained on public datasets' native columns can't score our children —
  hence we simulate in *our* feature schema, grounded in public-data statistics.

## 1. Feature schema (the contract between training and serving)

One feature vector per child (per current term), built only from our tables:

| Feature | Source |
|---|---|
| `quiz_avg_pct` | mean of `quiz_attempts.score / max_score` |
| `quiz_count` | count of `quiz_attempts` |
| `material_activity` | count of `student_activity` rows |
| `avg_watch_percent` | mean `student_activity.watch_percent` (videos) |
| `attendance_pct` | `academic_records.attendance_pct` |
| `prior_avg_score` | mean of past `academic_records` assessment/exam scores |
| `monitoring_hours` | `engagement_index.monitoring_hours` (parental) |
| `check_frequency` | `engagement_index.check_frequency` (parental) |
| `parental_attention` | `engagement_index.avg_attention_score` — **neutral 0.5 placeholder until the Phase 7 camera lands** |

The trained model's feature order is frozen in a sidecar meta file so serving
builds the vector identically.

## 2. Dataset pipeline

Files: `ml/data_prep.py` (load + study public sets), `ml/generate_simulated.py`.

- Load `datasets/archive/xAPI-Edu-Data.csv` and `datasets/student+performance/`
  (unzip), extract the statistical relationships the literature/plan rely on
  (parental involvement / family support / attendance → performance).
- **Generate a simulated Sri Lankan O/L dataset in the exact feature schema
  above**, with a `risk_band` label correlated with those relationships
  (higher parental engagement / quiz avg / attendance → lower risk). Tag each row
  `data_source='simulated_sl'`. Optionally recast real xAPI rows into the schema
  (`data_source='xapi'`) and union them.
- Output: `datasets/generated/training_data.csv` (git-ignored or committed —
  decide during build; small file, likely commit for reproducibility).

## 3. Engagement scorer (`ml/engagement.py`) — formula, not a model

```
PEI = 0.4 · norm(monitoring_hours)
    + 0.3 · norm(check_frequency)
    + 0.3 · parental_attention        # 0.5 placeholder until camera
```

Reads `monitoring_sessions` (sum duration → hours, count `history_checks`),
normalizes, computes PEI, upserts an `engagement_index` row for the child+period.
Also the source of the parental features for the predictor.

## 4. Predictor training (`ml/train_predictor.py`, offline)

- `RandomForestClassifier` → 3-class `risk_band` ∈ {low, medium, high}.
- Report **accuracy, precision, recall, F1** + confusion matrix + cross-val
  (compare against the proposal's metrics; optionally benchmark XGBoost/LogReg).
- Save the winner as versioned `ml/models/predictor_v1.pkl` (joblib) + a sidecar
  `ml/models/predictor_v1.meta.json` (feature order, class labels, metrics,
  trained-on `data_source` mix, version string).

## 5. Serving

- `ml/predictor.py`: load the `.pkl` + meta at startup; `build_features(child_id,
  client)` assembles the vector in the meta's feature order; `predict(child_id)`
  → `{risk_band, risk_score (top-class probability), top_factors}`.
  `top_factors` = top-k features by importance, annotated with the child's value
  and direction (e.g. `quiz_avg low → raises risk`).
- `routers/predictions.py`:
  - `GET /predictions/{child_id}` — parent/admin; parent must be linked
    (reuse the linked-child check pattern from `parent.py`). Returns the latest
    stored prediction (compute on demand if none).
  - `POST /predictions/run` — admin; batch-recompute for all children, write
    `predictions` rows (`model_version`, `risk_band`, `risk_score`, `top_factors`).
- `routers/engagement.py`:
  - `GET /engagement/{child_id}` — parent/admin; compute/return the engagement index.
- Register both routers in `main.py`. All ML/role-checked logic stays in FastAPI
  (RLS-vs-API golden rule).

## 6. Seed / demo generator (`scripts/seed_demo.py`)

Idempotent, tagged demo data so predictions render for existing child accounts:
per child insert plausible `academic_records`, `student_activity`, and
`engagement_index` (+ a `monitoring_sessions` row for the linked parent) spread
across risk levels. Clears its own prior demo rows on re-run (keep drives
idempotent — project habit). This is how the simulated pipeline is demonstrated.

## 7. Frontend (minimal — just meet Phase 5 exit criteria; polish in Phase 6)

- `lib/types.ts`: add `Prediction` and `EngagementIndex`; `lib/api.ts` calls.
- **Parent** Overview: risk band + risk score + top-factor list + own engagement
  trend.
- **Admin** roster (Users or a new section): each child's current risk band.
- Full roster-by-risk / intervention notes / model-health views are Phase 6.

## 8. Dependencies & verification

- Add `scikit-learn`, `pandas`, `numpy`, `joblib` to `backend/requirements.txt`
  (install into `.venv`).
- Verify: training script prints metrics; `tsc --noEmit` clean; run
  `POST /predictions/run`, then view predictions as parent and admin in the UI;
  **delete demo data afterward** (real Supabase project — established cleanup habit).
- After build: update `app/README.md` "Current status" (Phase 5 done) and add a
  `Progress_Log.md` entry.

## Open items to decide during the build
- Whether to commit `training_data.csv` and the `.pkl` (reproducibility vs repo
  size) — likely commit both (small).
- Exact normalization ranges for `monitoring_hours` / `check_frequency` in PEI.
- Risk-band thresholds used when generating the simulated labels.
