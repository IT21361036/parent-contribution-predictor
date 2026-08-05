# Viva Guide — O/L LMS with Parental Monitoring

**Complete end-to-end walkthrough for defending this project.**

Every number in this document was read out of the actual codebase and the
trained model's metadata file on the date noted, not copied from earlier docs.
Where an earlier document disagrees with this one, this one was verified later.

- Model trained: **2026-07-25**, version `predictor_v1`
- Database: **18 tables**
- API: **54 endpoints across 14 routers**

---

## Contents

1. [The 60-second answer](#1-the-60-second-answer)
2. [Research positioning](#2-research-positioning)
3. [System architecture](#3-system-architecture)
4. [The database](#4-the-database)
5. [The backend](#5-the-backend)
6. [The machine learning system](#6-the-machine-learning-system)
7. [How a prediction is made, step by step](#7-how-a-prediction-is-made-step-by-step)
8. [Prediction insights and explainability](#8-prediction-insights-and-explainability)
9. [The Parental Engagement Index](#9-the-parental-engagement-index)
10. [How the camera captures attention](#10-how-the-camera-captures-attention)
11. [Limitations you should raise yourself](#11-limitations-you-should-raise-yourself)
12. [Viva questions and answers](#12-viva-questions-and-answers)
13. [The hard questions](#13-the-hard-questions)
14. [Cheat sheet](#14-cheat-sheet)

---

## 1. The 60-second answer

> *"This is a role-based Learning Management System for Sri Lankan O/L students
> with three portals — admin, parent and child. On top of the LMS sit two
> intelligence layers: an explainable Random Forest that predicts each student's
> performance risk as low, medium or high with reasons attached, and a
> transparent Parental Engagement Index formula that scores how involved each
> parent is.
>
> The research contribution is not the finding that parental involvement matters
> — that is already established in the literature. It is the **measurement
> method**: a webcam pointed at the **parent**, verifying in-browser that they
> are genuinely attending to their child's progress, replacing self-reported
> involvement with an objective signal. That makes this Multimodal Learning
> Analytics applied to a new subject.
>
> One model was trained by us. One pre-trained model is used as-is for the
> camera. One scorer is a deliberate formula, not machine learning."*

**Model inventory** — memorise this table, it is the most common opening question:

| # | Component | Type | Trained by us? | Shipped? |
|:--:|---|---|---|:--:|
| 1 | **Performance-risk predictor** (Random Forest) | ML classifier | **Yes — the one trained model** | ✅ `predictor_v1` |
| 2 | Logistic Regression | ML benchmark | Trained only to compare | ❌ |
| 3 | Gradient Boosting | ML benchmark | Trained only to compare | ❌ |
| 4 | **MediaPipe FaceLandmarker** (478 points) | Pre-trained deep model | **No — used as-is** | ✅ in-browser |
| 5 | **Parental Engagement Index** | Rule-based formula | N/A — not ML | ✅ |
| — | Attention-quality classifier | ML | **Deliberately not built** | ❌ |

---

## 2. Research positioning

### Field vs methodology

Keep these separate — examiners notice when a candidate confuses them.

- **Field:** Learning Analytics → Educational Data Mining → **Multimodal
  Learning Analytics (MMLA)**. It becomes MMLA the moment camera data joins the
  behavioural logs.
- **Methodology:** **Design Science Research (DSR)** — build an artifact, then
  evaluate it.

### The gap

The parental-involvement → performance link is **already well established**.
Claiming to discover it would be a mistake. The defensible novelty is:

> **Objective, camera-verified measurement of parental attention, instead of
> unreliable self-reports.**

Every existing attention study points the camera at the **student**. No existing
work points it at the **parent**. That absence is the gap.

### Association, never causation

The training data is simulated, so this demonstrates the **method and pipeline**,
not a proven effect size. Say "associated with", never "causes". The admin
Insights page states this on screen next to the correlation figure.

### Ethical stance

- Video is processed **in the browser**; only a number and a duration are stored.
- The **child never sees their own risk score** — a "high risk" label is
  self-fulfilling for a teenager.
- Parent-facing risk copy uses supportive language, never blame.
- Real data collection involving minors and a webcam would require formal
  ethics-committee review.

---

## 3. System architecture

A single-page React app talks to **two backends**. Supabase issues the JWT and
stores files; FastAPI owns all business logic and every authorization decision.

```
┌──────────────── Browser (React SPA) ─────────────────┐
│  Role-based UI · MediaPipe camera · Recharts          │
└───────┬──────────────────────────────┬───────────────┘
        │ Supabase JWT                  │ Supabase JWT
        ▼                               ▼
┌────────────────────┐      ┌──────────────────────────┐
│ Supabase (hosted)  │      │  FastAPI backend         │
│ • Auth (issues JWT)│      │ • All business logic     │
│ • Storage (signed) │      │ • All role checks        │
└─────────┬──────────┘      │ • ML predictor + PEI     │
          │                 └────────────┬─────────────┘
          │                              │ service-role key
          ▼                              ▼ (bypasses RLS)
     ┌────────────────────────────────────────┐
     │   Supabase PostgreSQL — 18 tables      │
     └────────────────────────────────────────┘
```

**Request lifecycle:** CORS → route match → auth dependency (verify JWT, load
profile) → role guard → ownership guard → service-role query → optional
service/ML call → JSON response.

**Three backend tiers:** routers (HTTP surface, guards) → services and ML
(domain logic) → one DB accessor (`get_service_client()`).

---

## 4. The database

**18 tables**, 4 enum types, RLS enabled on all 18, 6 policies, 3 indexes, the
`pgcrypto` extension, and 2 private storage buckets.

### The golden rule — know this cold

> RLS is **enabled on every table**, so nothing is world-readable. But **all
> authorization runs in FastAPI using the service-role key, which bypasses RLS
> entirely.** Sensitive tables have RLS on and **deliberately no policy** — they
> are reachable only through the API, which applies its own role and ownership
> checks. A handful of harmless reads (own profile, own links, subjects,
> materials) have policies and go direct to Supabase.

If asked *"why not just use RLS for everything?"*: RLS cannot express the rules
this system needs — "a parent may read this child only if a `parent_child_link`
row exists, and only these columns, and only if the quiz is fully graded". That
logic belongs in application code where it is testable. Doing both would mean
two sources of truth that can silently disagree.

### The tables

| Table | Purpose |
|---|---|
| `profiles` | Role + details layered on Supabase `auth.users` (PK = FK) |
| `parent_child_link` | Parent↔child bridge, `UNIQUE(parent_id, child_id)` — the linchpin of family-boundary auth |
| `subjects` | O/L subjects, with `is_core` marking core vs elective |
| `child_subjects` | Which optional subjects each student takes |
| `learning_materials` | Uploaded content → `materials` bucket |
| `quizzes` | Quiz metadata + optional `due_date` |
| `quiz_questions` | Questions; options/answer key for MCQ auto-grading |
| `quiz_attempts` | Submissions: score, answers, `question_scores`, `graded` |
| `student_activity` | Every learning event — **the predictor's behavioural fuel** |
| `monitoring_sessions` | Parent sessions: duration, pages, `focus_losses`, `away_seconds` |
| `attention_scores` | Camera output (0–1 + seconds). **Numbers only, never video** |
| `engagement_index` | PEI output; also the predictor's parental-feature source |
| `academic_records` | Term assessment/exam scores + attendance % |
| `predictions` | `risk_band`, `risk_score`, `top_factors` JSON |
| `intervention_notes` | Admin-only private staff case log |
| `notifications` | In-app parent notifications; `read_at` feeds engagement |
| `report_cards` | Admin PDF per student per term |
| `messages` | Created ahead of a future messaging feature — **currently unused** |

Verified: every one of the **17 tables the backend code queries** exists in
`schema.sql`. `messages` is the only unused one.

### Enums

`user_role` (admin, parent, child) · `material_type` (document, video,
exam_paper, slide) · `question_type` (mcq, short_answer) · `activity_action`
(view, download, video_watch, quiz_start, quiz_submit).

There is **no teacher role** — it was removed early and folded into admin.

---

## 5. The backend

FastAPI, **54 endpoints across 14 routers**:

| Router | Prefix | Endpoints |
|---|---|:--:|
| `parent` | `/parent` | 10 |
| `admin` | `/admin` | 7 |
| `quizzes` | `/quizzes` | 7 |
| `report_cards` | — | 6 |
| `students` | `/admin/students` | 6 |
| `materials` | `/materials` | 3 |
| `notifications` | `/notifications` | 3 |
| `subjects` | `/subjects` | 3 |
| `activity`, `engagement`, `predictions` | — | 2 each |
| `analytics`, `health`, `profiles` | — | 1 each |

### Authentication

The browser sends `Authorization: Bearer <supabase-jwt>`. The backend verifies it
against Supabase's **JWKS endpoint** using **asymmetric keys (ES256/RS256)**,
with `audience="authenticated"` and `leeway=10s` for clock skew.

**The role is read from the `profiles` table, not from the JWT.** The token
proves *who you are*; the database is the source of truth for *what you may do*.
That way revoking a role takes effect immediately rather than when the token
expires.

### Authorization — two independent layers

1. **Role guard** — `require_role("admin")` returns 403 if the role does not match.
2. **Ownership guard** — a parent endpoint additionally verifies a
   `parent_child_link` row exists for that exact child, else 403 "Not linked to
   this child".

**Role alone is never sufficient.** Being a parent does not grant access to
*every* child, only to linked ones.

### Per-student optional subjects

O/L students take roughly six compulsory subjects plus their own electives, so
`subjects.is_core` marks core subjects (implicit for everyone) and
`child_subjects` records each student's electives. One resolver,
`app/services/subject_access.py`, answers "which subject ids may this child see"
as **core ∪ assigned**, and every child-reachable read calls it.

Two endpoints had **no subject check at all** before this was added:
`GET /materials/{id}/download` and `POST /quizzes/{id}/attempts`. The second
matters most — an attempt on a subject the student does not take would pollute
their score history *and* the predictor's features.

### Notification service

Four event types — `quiz_result`, `quiz_due`, `report_card`, `risk_alert` —
fanned out to all linked parents, created only by the backend. `quiz_due`
reminders are generated **lazily on request** with dedup, so no cron job is
needed. `notify_safe` guarantees a notification failure never fails the
underlying action. **Reading a notification raises `check_frequency`**, which
raises the PEI — a feedback loop that needs no model retrain.

---

## 6. The machine learning system

### 6.1 The problem framing

**Supervised multi-class classification.** Input: 9 numeric features describing
one student. Output: one of three risk bands — `low`, `medium`, `high`.

Framed as classification rather than regression deliberately: a teacher acts on
"this student needs attention", not on "predicted score 61.4".

### 6.2 The trained model

| Property | Value |
|---|---|
| Algorithm | `RandomForestClassifier` (scikit-learn) |
| Hyperparameters | `n_estimators=300`, `max_depth=None`, `random_state=42` |
| Pipeline | Single `clf` step — **no scaler** (trees are scale-invariant) |
| Train/test split | **75 / 25, stratified** on risk band, seed 42 |
| Cross-validation | **5-fold, macro-F1** |
| Training rows | **1,680** — 1,200 simulated + 480 real xAPI |
| Artifacts | `predictor_v1.pkl` + `predictor_v1.meta.json` |

### 6.3 What a Random Forest actually is — explain it simply

> *"A decision tree asks a chain of yes/no questions — 'is attendance below
> 70%?', 'is the quiz average below 0.5?' — and lands on a prediction. A single
> tree overfits: it memorises its training data. A Random Forest trains 300
> trees, each on a random bootstrap sample of rows and considering a random
> subset of features at each split. Every tree votes and the majority wins. The
> randomness makes the errors of individual trees uncorrelated, so they cancel
> out — that's **bagging**, or bootstrap aggregation. And because I can count how
> much each feature reduced impurity across all 300 trees, I get feature
> importances for free. That's what makes it explainable."*

### 6.4 The 9 features — frozen order

The order is defined once in `app/ml/features.py` and shared by **both training
and serving**, then frozen into the model's meta file. Reordering requires a
retrain.

| # | Feature | Meaning | Source table | Importance |
|:--:|---|---|---|---:|
| 6 | `prior_avg_score` | Mean past assessment + exam scores | `academic_records` | **0.2176** |
| 1 | `quiz_avg_pct` | Mean quiz score ratio (0–1) | `quiz_attempts` | 0.1630 |
| 5 | `attendance_pct` | Attendance % | `academic_records` | 0.1292 |
| 7 | `monitoring_hours` | Parent monitoring hours | `engagement_index` | 0.0979 |
| 2 | `quiz_count` | Number of attempts | `quiz_attempts` | 0.0969 |
| 4 | `avg_watch_percent` | Mean video watch % | `student_activity` | 0.0889 |
| 3 | `material_activity` | Count of activity events | `student_activity` | 0.0810 |
| 8 | `check_frequency` | Parent check-ins | `engagement_index` | 0.0667 |
| 9 | `parental_attention` | Camera attention (0–1) | `engagement_index` | 0.0586 |

*(The # column is position in the frozen vector; the table is sorted by
importance.)*

**Three of nine features are parental** — `monitoring_hours`, `check_frequency`,
`parental_attention` — and together they carry **0.223** of total importance,
which is the second-largest block after prior academic performance. That number
is the thesis argument in one figure.

**Missing-data policy:** missing signals default to **0** — a student with no
data correctly reads as elevated risk. The one exception is
`parental_attention`, which defaults to the neutral **0.5 placeholder** until the
camera supplies a real value.

### 6.5 Model comparison — be honest about this

All three were trained and evaluated. The real numbers:

| Model | Accuracy | Precision | Recall | **F1 (macro)** | **CV F1 mean ± std** |
|---|---:|---:|---:|---:|---:|
| **Random Forest** ✅ shipped | 0.7452 | 0.7705 | 0.7394 | 0.7521 | 0.7281 ± 0.037 |
| Gradient Boosting | **0.7476** | 0.7655 | **0.7451** | **0.7540** | 0.7214 ± 0.0427 |
| Logistic Regression | 0.7333 | 0.7549 | 0.7299 | 0.7404 | **0.7504 ± 0.0211** |

**Read this carefully, because an examiner will.** Random Forest does **not** win
outright:

- **Gradient Boosting** has the best held-out accuracy and macro-F1.
- **Logistic Regression** has the best cross-validated F1 *and* the tightest
  standard deviation (0.021 vs 0.037), meaning it is the most stable.
- All three sit within about **1.4 percentage points** of each other.

Random Forest was chosen for **explainability, not dominance**. The training
script encodes exactly that: `winner` is hardcoded to `random_forest`, and it
only prints a note if a challenger beats it on CV F1 by **more than 0.03**. The
Logistic Regression gap is 0.0223 — under the threshold, so RF stays.

**Own this rather than hiding it.** "The three models are statistically
indistinguishable on this data, so I selected on the criterion that serves the
research question: the feature importances *are* my parental-factor argument."

### 6.6 Where the training data comes from

**Why simulate?** No public dataset holds this exact combination of features per
O/L student — particularly not parental monitoring hours and camera-verified
attention, which do not exist in any published dataset because nobody has
collected them.

**What was done instead:** public datasets were mined for their *documented
relationships*, and those relationships were reproduced in a simulated Sri
Lankan O/L dataset in our schema.

- **xAPI-Edu-Data** (480 rows) — primary grounding; carries real parental fields.
  For example, parents answering the involvement survey yes vs no shows a
  1.32 / 0.66 split, and absences under 7 vs over 7 shows 1.44 / 0.41.
- **UCI Student Performance** — family-context features.
- **OULAD** — large behavioural reference.

**Generation procedure (seed 42):** a latent "engaged household + able student"
factor drives correlated features, so the columns are not independent noise. A
weighted success score — prior grades 0.24, quiz average 0.20, attendance 0.15,
parental factors ~0.30 combined — plus random noise maps to a band: **≥0.60 low,
≥0.42 medium, otherwise high**. Every row carries a `data_source` tag, and the
480 real xAPI rows are recast into the schema alongside the 1,200 simulated ones.

**The honest framing:** the model learns relationships that were partly designed
in. It validates the *pipeline*, not a real-world effect size.

---

## 7. How a prediction is made, step by step

When an admin clicks **Run predictions**:

**1. Assemble the feature vector** (`build_features`) — four queries per child:

- `quiz_attempts` → mean of `score / max_score`, and the attempt count
- `student_activity` → row count, and mean `watch_percent`
- `academic_records` → mean attendance %, and mean of assessment + exam scores
- `engagement_index` → most recent row for `monitoring_hours`,
  `check_frequency`, `avg_attention_score`

**2. Apply the missing-data policy** — absent values become 0, except
`parental_attention` which becomes 0.5.

**3. Build a named DataFrame in the frozen order** — the column names come from
`meta["feature_order"]`, so the model sees exactly the names it was fitted on.
This avoids scikit-learn's feature-name mismatch warning and, more importantly,
guarantees no silent column misalignment.

**4. `predict_proba`** returns three probabilities. The highest wins.

```python
proba    = model.predict_proba(vector)[0]
classes  = list(model.classes_)      # ['high', 'low', 'medium'] — alphabetical
top_idx  = int(proba.argmax())
risk_band  = classes[top_idx]
risk_score = round(float(proba[top_idx]), 4)
```

> **Detail worth knowing:** `model.classes_` is `['high', 'low', 'medium']` —
> scikit-learn sorts labels alphabetically, which is *not* the display order
> low→medium→high. Serving reads the band by index from `model.classes_` rather
> than assuming an order, so the two never desynchronise. If asked about it, this
> is a deliberate correctness guard.

**5. Attach explanations** — see the next section.

**6. Persist** to `predictions`, and if the band worsened, fire a `risk_alert`
notification to every linked parent.

**Note what `risk_score` actually is:** it is the model's **confidence in the
predicted class**, not a 0–100 danger level. A "low risk, 0.92" means the model
is 92% sure the student is low risk. Do not let an examiner catch you calling it
a risk magnitude.

---

## 8. Prediction insights and explainability

Explanations take the **top 4 features by global importance**, compare each to a
population midpoint, and phrase the result in plain language.

Midpoints from `features.py`: quiz average 0.55, quizzes 5, material activity 12,
watch 55%, attendance 80%, prior grades 55, monitoring hours 3, check-ins 8,
attention 0.5.

Every feature in the schema is **protective** — higher is safer. So a value below
its midpoint *raises* risk, and the direction logic is a single flag per feature,
making it a one-line change if a risk-increasing feature is ever added.

A parent sees something like:

> - prior grades is low → **raises** risk (value 41.2)
> - quiz average is low → **raises** risk (value 0.38)
> - attendance is high → **lowers** risk (value 91.0)
> - parental monitoring hours is low → **raises** risk (value 1.4)

### The limitation you must volunteer

> **These are global importance rankings, not per-child SHAP attributions.** The
> same four features appear for every student; only the values and directions
> personalise. A genuine per-child attribution would use SHAP or LIME — that is
> the clear next step, and I can name it.

Volunteering this converts a potential gotcha into evidence of understanding.

---

## 9. The Parental Engagement Index

**A transparent weighted formula. Not machine learning. Deliberately.**

```
PEI = 0.4 × norm(monitoring_hours, cap 10)
    + 0.3 × norm(check_frequency,  cap 25)
    + 0.3 × parental_attention        (0.5 placeholder until the camera)
```

where `norm(v, cap) = clamp(v / cap, 0, 1)` and the weights sum to 1.

`check_frequency` = history checks + notifications the parent has read.

**Why the caps matter:** they match the ranges the training data was generated in,
so a PEI computed at runtime is directly comparable to the parental features the
model trained on. Change one without retraining and serving silently drifts from
training.

**Why a formula and not a model?** Three reasons: there is no ground-truth label
for "true engagement" to train against; a parent has an absolute right to know
exactly why they scored what they scored; and a learned scorer feeding a learned
predictor would make the whole parental argument circular and unfalsifiable.

The `engagement_index` table is both a product surface (the parent sees their
score) and the predictor's parental-feature source.

---

## 10. How the camera captures attention

**The novelty. The camera points at the parent, and runs entirely in the browser.**

### The pipeline

1. **Consent gate** — explains on-device processing, that no video is stored, the
   liveness check, the on-air indicator and the 3-minute minimum. Nothing starts
   until accepted.

2. **Face landmarking** — MediaPipe Tasks-Vision **0.10.35** `FaceLandmarker`,
   **478 points**, on a hidden self-view. Detection runs every **120 ms (~8 fps)**;
   React state updates are throttled to every **250 ms** so rendering never
   competes with inference.

3. **Liveness first** — confirms a real person via **blink or head motion** before
   any attention is counted. **8-second timeout**, retryable. This is what stops a
   photograph propped in front of the webcam.

4. **Eyes-on-screen heuristic** — attentive only if the iris is centred in *both*
   eyes **and** the head faces forward. Thresholds are named constants, not magic
   numbers:

   | Threshold | Value | Meaning |
   |---|---:|---|
   | `horizontal` | 0.23 | Max iris deviation left/right from eye-centre |
   | `vertical` | 0.30 | Max iris deviation up/down |
   | `yaw` | 0.16 | Max head turn from facing forward |
   | `blinkLow` | 0.16 | Eye-aspect-ratio below this = eye shut |
   | `blinkOpen` | 0.24 | EAR above this = eye open again (completes a blink) |
   | `motion` | 0.06 | Yaw range counting as deliberate head motion |

   Landmarks 468 and 473 are the two iris centres; eye corners and lids give the
   eye-aspect-ratio; nose tip 1 against face edges 234/454 gives head yaw.

5. **Accumulation with debounce** — a **1.5-second grace window** means a blink or
   a glance away does not immediately break the attentive streak. Frame gaps are
   capped at **500 ms**, so a stalled or backgrounded tab cannot inflate the total.

6. **Anti-gaming** — switching tabs counts as inattentive.

7. **Minimum-time lock** — at least **3 minutes** of genuine tracking must accrue
   before Stop enables, with a live countdown.

8. **Result POST** — only `{attentive_seconds, total_seconds, liveness_passed}`
   is sent. **No frame ever leaves the browser.**

### Why MediaPipe rather than training our own

Three reasons, in order of strength: no parent-attention dataset exists to train
on; fine-tuning would need labelled gaze data, a GPU and weeks; and MediaPipe
runs in the browser, which *is* the privacy backbone — training our own would
mean shipping video to a server, destroying the ethical position.

**The rule logic on top is ours.** MediaPipe returns 478 coordinates; deciding
what counts as "attentive", how to debounce it and how to resist gaming is the
contribution.

### Graceful degradation

Camera denied, absent or failed → monitoring continues on behaviour alone with
the 0.5 attention placeholder. No schema change was needed because the
`attention_scores` socket existed from day one.

---

## 11. Limitations you should raise yourself

Raising these first is worth more marks than being caught by them.

1. **Trained on simulated data.** ~74.5% accuracy reflects simulated
   relationships. Association, not causation. Real deployment needs a consented
   real cohort.
2. **Random Forest did not win outright.** Gradient Boosting edges it on test F1,
   Logistic Regression on CV F1. Chosen for explainability.
3. **Explanations are global importances, not per-child SHAP.**
4. **`parental_attention` is the least-important feature at 0.0586** — due to
   compressed variance in simulation and being constant at 0.5 across the 480
   xAPI rows, not because the real signal is weak. It is untested against
   outcomes.
5. **Camera thresholds need real-device calibration.** Tuned on controlled input;
   treat the attention percentage as indicative.
6. **PEI weights are chosen, not learned** — by design, but they are a judgement.
7. **No parent face-matching** — deliberately not built. Biometric PII, and
   liveness is sufficient for the research claim.

---

## 12. Viva questions and answers

### On the research

**Q: What is your actual contribution?**
Objective, camera-verified measurement of parental attention. The
involvement→performance link is established; my contribution is methodological —
applying Multimodal Learning Analytics to a new subject, the parent, replacing
self-reports with an on-device measurement.

**Q: Why is this Multimodal Learning Analytics?**
Because it fuses two different data modalities: interaction logs from the LMS,
and camera-derived attention data. Behavioural logs alone would be ordinary
Learning Analytics.

**Q: Why simulated data? Isn't that a weakness?**
No public dataset holds this feature combination per O/L student — parental
monitoring hours and camera-verified attention don't exist in any published set
because nobody has collected them. I mined xAPI and UCI for documented
relationships, reproduced them in my schema, and recast 480 real xAPI rows
alongside 1,200 simulated ones. I demonstrate the method; every result is framed
as association; every row is tagged with its `data_source`.

**Q: Isn't your model just learning relationships you designed in?**
Partly, yes, and I state that openly. The simulation encodes effect sizes taken
from published datasets rather than invented ones, and 480 rows are real. What
this validates is the pipeline — feature contract, training, serving,
explanation — not a real-world effect size. Proving the effect requires a real
cohort, which is the stated next step.

### On the machine learning

**Q: How many models did you train?**
Exactly one shipped: the Random Forest. Two more — Logistic Regression and
Gradient Boosting — were trained purely as benchmarks. MediaPipe is pre-trained
and used as-is. The PEI is a formula, not a model.

**Q: Why Random Forest and not deep learning?**
Two reasons. Tree ensembles beat neural networks on tabular data of this size —
1,680 rows would badly overfit a network. And explainability is the point: the
feature importances *are* my parental-factor argument. A black box would defeat
the research purpose.

**Q: Is 74.5% accuracy good?**
On three classes, chance is ~33%, so 0.745 accuracy and 0.752 macro-F1 is a
solid, balanced result. Macro-F1 matters more than accuracy here because it
weights all three bands equally regardless of class size. But it is on simulated
plus xAPI data, so it validates the pipeline, not a real-world effect.

**Q: Why macro-F1 rather than accuracy?**
Accuracy can hide poor performance on a minority band — predicting the majority
class always would still score reasonably. Macro-F1 averages the per-class F1
equally, so failing on "high risk" is penalised properly. Missing a genuinely
at-risk student is the costly error here.

**Q: Did Random Forest actually beat the others?**
No, and I'm explicit about that. Gradient Boosting has slightly better test F1
(0.7540 vs 0.7521); Logistic Regression has better cross-validated F1 (0.7504 vs
0.7281) and is more stable. All three are within 1.4 points. I selected on
explainability, and my training script encodes that: it only overrides Random
Forest if a challenger beats it on CV F1 by more than 0.03.

**Q: Why is your CV F1 lower than your test F1?**
The test score comes from one particular 25% split; the CV mean averages five
folds and is the more trustworthy estimate. A gap of about 0.024 with a standard
deviation of 0.037 means the test split was slightly favourable — normal
variance, not overfitting.

**Q: How do you prevent overfitting?**
Bagging across 300 trees on bootstrap samples, a stratified held-out test set
never seen during fitting, and 5-fold cross-validation reported alongside. I did
not cap `max_depth` — with 300 trees the ensemble averaging controls variance,
and the CV standard deviation of 0.037 confirms it isn't memorising.

**Q: Why no feature scaling?**
Trees split on thresholds within a single feature, so monotonic rescaling changes
nothing. Only the Logistic Regression benchmark is wrapped with a
`StandardScaler`, so it competes fairly rather than being hobbled.

**Q: What is `random_state=42` for?**
Reproducibility. It fixes the bootstrap sampling, the feature subsampling and the
train/test split, so the same data produces the same model and the same reported
metrics on any machine.

### On prediction and explanation

**Q: Walk me through one prediction.**
Four queries assemble the nine features for that child; missing values default to
0 except attention which defaults to 0.5; the vector is built as a named
DataFrame in the frozen feature order; `predict_proba` returns three
probabilities; the highest becomes the band and its probability the confidence;
the top four features by importance are annotated against population midpoints;
the result is written to `predictions` and, if the band worsened, a `risk_alert`
notification fires to linked parents.

**Q: What does `risk_score` mean?**
It's the model's confidence in the predicted class, not a danger magnitude. Low
risk with 0.92 means 92% confident the student is low risk.

**Q: How does the model explain itself?**
Top four features by global importance, each compared to a population midpoint
and phrased as "raises" or "lowers" risk with the student's own value. I'm
transparent that these are global rankings, not per-child SHAP attributions —
the same four features appear for everyone, only the values personalise. SHAP is
the natural next step.

**Q: Why does the feature order need to be frozen?**
The model is fitted on positional columns. If serving built the vector in a
different order, every prediction would be silently wrong — no error, just
nonsense. So the order lives in one file used by both training and serving, and
is written into the model's metadata sidecar. Serving rebuilds a named DataFrame
from that stored order.

**Q: What happens to a brand-new student with no data?**
Every behavioural feature is 0, which pushes them toward high risk. That's the
correct default — an invisible student is a concern, not a safe one — but a user
should read it as "insufficient data" rather than a genuine assessment.

### On the camera

**Q: Isn't a camera on a parent an ethics problem?**
I designed for it. All processing is in-browser; only a number and a duration are
stored; no frame ever leaves the device. There's an explicit consent gate, a
visible on-air indicator, and a liveness check. Real data collection would
require formal ethics-committee review given minors and a webcam.

**Q: How do you stop a parent gaming the timer?**
Four defences. Liveness confirms a live person rather than a photo. Tab-switching
counts as inattentive. Frame gaps are capped at 500 ms so a stalled tab can't
inflate totals. And at least 3 minutes of genuine tracking must accrue before
Stop enables.

**Q: How do you know they're looking at the screen and not past it?**
A two-condition heuristic: iris centred within 0.23 horizontally and 0.30
vertically in both eyes, *and* head yaw within 0.16 of forward. Both must hold.
I'm honest that this is a heuristic — true gaze estimation needs per-device
calibration, so I treat the output as indicative.

**Q: Why not train your own attention model?**
No parent-attention dataset exists. Fine-tuning would need labelled gaze data, a
GPU and weeks I didn't have. And MediaPipe runs in-browser, which is the entire
privacy argument — training my own would mean shipping video to a server.

**Q: What if the parent has no webcam?**
Monitoring continues on behaviour alone with the 0.5 neutral placeholder. The
`attention_scores` table existed from day one, so no schema change was needed.

### On the system

**Q: How do you stop one family reading another's data?**
Every table has RLS enabled; sensitive tables have no client-read policy at all,
so they're reachable only through my API. The API enforces two independent
layers: a role guard, and an ownership check verifying a `parent_child_link` row
for that exact child. Role alone is never sufficient.

**Q: Why enable RLS but not write policies?**
Defence in depth. RLS on with no policy means a leaked anon key still reads
nothing. The authorization rules this system needs — link-based, column-aware,
state-dependent — can't be expressed cleanly in SQL policies, and splitting them
across two places would create two sources of truth that drift.

**Q: Why read the role from the database rather than the JWT?**
The token proves identity; the database is the source of truth for permissions.
Revoking a role takes effect on the next request instead of when the token
expires.

**Q: Why doesn't the child see their risk score?**
A "high risk" label is self-fulfilling for a teenager. Risk is visible only to
admins and parents, always in supportive language. It's an ethical design choice,
not a technical limitation.

**Q: How do you know the tests are meaningful if they don't hit a real database?**
They use an in-memory fake implementing the query-builder surface the code uses,
so they test *my* logic — authorization, filtering, grading — deterministically
and fast. I'm clear about the boundary: they cannot catch schema drift. A missing
migration passes every test and fails immediately in the browser. That's why
migrations are a documented deployment step.

**Q: What would you do next?**
Retrain on a real consented cohort; a real-device gaze-calibration pass; per-child
SHAP explanations; and, ethics permitting, fold the real camera attention signal
into training rather than the 0.5 placeholder.

---

## 13. The hard questions

The ones designed to find whether you understand your own work.

**Q: Your most important feature is prior academic score at 0.218. Doesn't that
mean your model just predicts that past grades predict future grades — which is
trivially known?**

Partly, and that's expected: prior attainment is the strongest predictor in
essentially all of the educational-data-mining literature, so a model that
*didn't* find it would be suspect. It's a sanity check that the pipeline works.
The interesting result is what sits alongside it — the three parental features
together carry 0.223 of importance, marginally more than prior grades alone, and
they're actionable in a way past grades are not. You cannot change a student's
history; you can change how a parent engages this term.

**Q: Your camera feature is the least important at 0.059. Doesn't that undermine
your entire thesis?**

It's the fairest challenge available, and the number is an artifact of how the
feature had to be constructed, not a finding about the real signal. Be precise,
because the careless version of this answer is checkable and wrong: the feature
is **not** simply constant. It varies across the 1,200 simulated rows; it is
constant at 0.5 only in the 480 recast xAPI rows. Three things suppress it:
**compressed variance** (it spans ~0.325–0.675 in simulation while
`prior_avg_score` spans 35–90, and trees split on thresholds, so a narrow range
offers fewer discriminating cut-points); **constant across 28.6% of the data**;
and it is drawn from the **same latent factor** as the stronger features, so
under correlated inputs the ensemble attributes importance to whichever splits
most cleanly — classic importance dilution. The telling detail: I assigned it
weight **0.10 in the label formula, fifth of nine**, yet it recovers as last at
0.0586. That gap between designed weight and recovered importance *is* the
result — with a low-variance, partly-constant proxy the signal cannot be
recovered, which is precisely the argument for collecting real camera data.

**Q: If the PEI feeds the predictor, and reading a risk alert raises the PEI,
haven't you built a circular system?**

There is a feedback loop, and it's deliberate rather than accidental: parental
responsiveness flows back into the next prediction without retraining the model.
It isn't circular in the invalidating sense because the loop passes through
real-world behaviour — a parent must actually open the notification. But it does
mean PEI and risk are not independent over time, so a longitudinal study would
need to account for it. It's a limitation of the deployed feedback design, not of
the model.

**Q: You said 18 tables but one is unused. Is that not dead code?**

`messages` was created up-front as part of a deliberate strategy: later-phase
tables were included in the initial schema so no phase needed a mid-project
migration. That paid off for `attention_scores`, which meant Phase 7's camera
needed no schema change at all. `messages` is the case where the feature was
descoped. I'd argue an empty table costs nothing, whereas a migration mid-viva
would have cost a lot — but it's fair to call it a loose end.

**Q: Your three models are within 1.4%. Isn't that just saying your features are
weak and the algorithm doesn't matter?**

It says the signal is in the features, not the algorithm — which is the normal
finding on well-constructed tabular problems and is genuinely informative. When
three model families with very different inductive biases converge, the ceiling
is being set by the information in the features. That strengthens rather than
weakens the case for picking on explainability, since accuracy isn't being
sacrificed to get it. It also tells me where to invest next: better features, or
real data, not a fancier algorithm.

**Q: How would you validate that camera-measured attention beats self-reported
involvement — your central claim?**

I'd need both measures on the same cohort: a standard parental-involvement
self-report questionnaire, plus the camera measurement, plus student outcomes
over a term. The test is which measure correlates more strongly with outcomes,
and whether the camera measure adds predictive power over the questionnaire in a
nested model comparison. I'd also expect to quantify the self-report bias
directly, by comparing what parents claim against what was measured. That study
is not in this project's scope — this project builds and validates the
instrument that would make it possible.

---

## 14. Cheat sheet

**Numbers**

| | |
|---|---|
| Tables / used / endpoints / routers | 18 / 17 / 54 / 14 |
| Features | 9 (3 parental) |
| Classes | 3 — low, medium, high |
| Training rows | 1,680 = 1,200 simulated + 480 xAPI |
| Trees / split / CV | 300 / 75-25 stratified / 5-fold |
| Seed | 42 |
| **Accuracy / macro-F1** | **0.7452 / 0.7521** |
| CV F1 | 0.7281 ± 0.037 |
| Top feature | `prior_avg_score` 0.2176 |
| Parental block | 0.223 combined |
| Weakest feature | `parental_attention` 0.0586 — low-variance artifact |
| PEI weights | 0.4 hours + 0.3 checks + 0.3 attention |
| PEI caps | 10 hours, 25 checks |
| Camera | MediaPipe 0.10.35, 478 points, ~8 fps |
| Grace / frame cap / min lock | 1.5 s / 500 ms / 3 min |

**Three sentences if you have no time**

1. One trained model — an explainable Random Forest predicting three risk bands
   from nine features, three of them parental.
2. The novelty is the camera pointed at the **parent**, verified in-browser,
   storing only a number.
3. The data is simulated, so it validates the method, not an effect size — and
   every result is framed as association, never causation.

**If you don't know an answer:** say what you *do* know, name the limitation, and
say what you'd do to find out. "I don't know, but here's how I'd check" scores
far better than a confident guess.
