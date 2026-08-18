# O/L LMS with Parental Monitoring — Full Technical Documentation

> **Purpose of this document.** A complete, end-to-end technical reference for the
> project: what was built, how it works, and *why* each decision was made. It is
> written to be defended in a viva — every claim maps to the actual code. A
> section of **anticipated examiner questions with model answers** is included at
> the end.

**Document version:** 1.0 · **Project:** Final Year Project (client01) ·
**Model version:** predictor_v1

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Research positioning (the thesis)](#2-research-positioning-the-thesis)
3. [System architecture](#3-system-architecture)
4. [Technology stack](#4-technology-stack)
5. [Database design](#5-database-design)
6. [Backend & API](#6-backend--api)
7. [The machine-learning system](#7-the-machine-learning-system) ← *core contribution*
8. [The camera attention feature (the novelty)](#8-the-camera-attention-feature-the-novelty)
9. [Frontend & feature walkthrough by role](#9-frontend--feature-walkthrough-by-role)
10. [Development phases & rationale](#10-development-phases--rationale)
11. [Key engineering decisions & why](#11-key-engineering-decisions--why)
12. [Limitations & honest scope](#12-limitations--honest-scope)
13. [Anticipated viva questions & answers](#13-anticipated-viva-questions--answers)

---

## 1. Executive summary

This project is a **role-based Learning Management System (LMS)** for Sri Lankan
**O/L (Ordinary Level)** students, built to study **how parental involvement
relates to student performance** — and, crucially, to introduce a *new way of
measuring* that involvement.

The system has **three roles**:

| Role | What they do |
|------|--------------|
| **Admin** | Provisions all accounts, uploads learning materials, builds and grades quizzes, uploads report cards, runs the risk predictions. |
| **Parent** | Monitors their linked child's activity, engagement and quiz results; opts into **camera-based attention verification**; receives notifications; views report cards. |
| **Child** | Studies materials and takes quizzes. Never sees a risk prediction (a deliberate ethical choice). |

Two intelligence layers sit on top of the LMS:

1. **A performance-risk predictor** — an explainable **Random Forest** classifier
   that predicts each child's risk band (*low / medium / high*) and explains *why*.
2. **A Parental Engagement Index (PEI)** — a transparent, weighted formula (not
   machine learning) that quantifies parental involvement.

The **novel research contribution** is that the camera points at the **parent**,
not the student: it objectively verifies that a parent is genuinely attending to
their child's progress, replacing unreliable self-reports.

---

## 2. Research positioning (the thesis)

*(Source: `plans/Research_Positioning.md`, `plans/Datasets.md`, `plans/Implementation_Plan_Updated.md`.)*

### 2.1 The research gap and novelty

The link between parental involvement and student performance is **already well
established** in the literature — so claiming to *discover* it would be a mistake.
The genuine contribution is methodological:

> **Objective, camera-verified measurement of parental attention during
> monitoring — instead of relying on unreliable self-reports.**

Every existing engagement/attention study points the camera at the **student**.
**No existing work points the camera at the parent.** This project applies
**Multimodal Learning Analytics (MMLA)** techniques — normally used on learners —
to a new subject (the parent), bridging two established fields.

### 2.2 Field vs methodology

- **Field:** Learning Analytics (LA) → Educational Data Mining (EDM) →
  **Multimodal Learning Analytics (MMLA)** (behavioural logs *plus* camera
  attention data). The affective-computing sub-area covers the camera work.
- **Methodology:** **Design Science Research (DSR)** — build an artifact, then
  evaluate it.

One-line framing: *"Field: Multimodal Learning Analytics (within LA / EDM), using
Design Science Research. Novelty: camera-verified parental attention, versus
self-reported involvement."*

### 2.3 Association, not causation

Because the training data is **simulated** (see §7.4), the project demonstrates the
**method and pipeline**, not a proven real-world effect size. All results — in the
thesis and in the UI — are framed as **association / prediction**, never
causation: *"more monitoring is **associated with** better results,"* never a
guarantee. This is stated openly as a strength (a clear, honest scope), not hidden.

### 2.4 Ethical stance

- **Privacy-first camera:** all video is processed **in the browser**; only the
  computed attention *number* and duration are ever stored — **no raw video or
  frames leave the device.** A consent gate precedes any camera use, with a
  visible on-air indicator.
- **Minors + webcam:** the design acknowledges that real (non-simulated) data
  collection would require a formal university ethics-committee review.
- **No self-fulfilling labels:** the **child never sees their own risk score** — a
  "high risk" label can be self-fulfilling for a teenager.
- **Support, not blame:** all parent-facing risk copy uses supportive language.

---

## 3. System architecture

### 3.1 High-level shape

The application is a **single-page React app** talking to **two backends**:

```
┌──────────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                         │
│   Role-based UI · MediaPipe camera (client-side) · Recharts    │
└───────────────┬───────────────────────────┬──────────────────┘
                │ Supabase JWT (bearer)       │ Supabase JWT (bearer)
                ▼                             ▼
    ┌───────────────────────┐     ┌──────────────────────────────┐
    │   Supabase (hosted)   │     │   FastAPI backend (Python)    │
    │  • Auth (issues JWT)  │     │  • All business logic          │
    │  • profiles table     │     │  • All role/ownership checks   │
    │  • Storage signed URLs │     │  • ML predictor + PEI          │
    └───────────┬───────────┘     └───────────────┬──────────────┘
                │                                  │ service-role key
                │        ┌─────────────────────────┘  (bypasses RLS)
                ▼        ▼
          ┌────────────────────────────────┐
          │  Supabase PostgreSQL (16 tables)│
          │  RLS enabled on every table     │
          └────────────────────────────────┘
```

- **Supabase** provides authentication (it issues the JWT), the `profiles`
  table, and file storage (signed URLs).
- **FastAPI** owns *all* business logic and *all* authorization. It talks to the
  database with the Supabase **service-role key**, which bypasses Row-Level
  Security (RLS).
- The **Supabase JWT bridges the two backends**: the browser attaches it as a
  bearer token to every FastAPI request, and FastAPI verifies it (see §6.2).

### 3.2 Backend layering (3 tiers)

```
Routers  (app/routers/*.py)   → HTTP surface: role guards, ownership checks
   │
   ▼
Services (app/services/…)     → domain logic (e.g. notifications, dedup)
ML       (app/ml/…)           → the predictor + the engagement formula
   │
   ▼
DB client (app/db/…)          → one accessor: get_service_client()
```

Every request flows: **CORS middleware → route → auth dependency (decode JWT +
load profile) → role/ownership guard → service-role DB query → optional
service/ML call → JSON response.** Any uncaught error is converted to a CORS-safe
JSON 500 (see §11).

---

## 4. Technology stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + TypeScript, Vite | Fast dev server, type safety, component model |
| **Styling** | Tailwind CSS v4 | Utility-first; the "Aurora Glass" design system (§9.5) |
| **Charts** | Recharts | Theme-aware, CVD-validated palettes |
| **Camera** | MediaPipe Tasks-Vision (`@mediapipe/tasks-vision` 0.10.35) | Pre-trained 478-point face landmarker, runs in-browser |
| **Backend** | FastAPI (Python) | Async, typed, auto OpenAPI docs |
| **Auth / DB / Storage** | Supabase (PostgreSQL + Auth + Storage) | Bundles a role concept, RLS, and file storage — ideal for a role-based app handling minors' data |
| **Machine learning** | scikit-learn (Random Forest), pandas, numpy, joblib | Tree ensembles excel on tabular data and are **explainable** |
| **Testing** | pytest + httpx (backend), `tsc` (frontend) | See the automated-tests section |

---

## 5. Database design

*(Source: `app/supabase/schema.sql`. Extension: `pgcrypto`. All tables for later
phases were created up-front so nothing needed a migration mid-project.)*

### 5.1 Custom types (enums)

| Type | Values |
|------|--------|
| `user_role` | `admin`, `parent`, `child` |
| `material_type` | `document`, `video`, `exam_paper`, `slide` |
| `question_type` | `mcq`, `short_answer` |
| `activity_action` | `view`, `download`, `video_watch`, `quiz_start`, `quiz_submit` |

### 5.2 The 16 tables (purpose)

| Table | Purpose |
|-------|---------|
| **profiles** | Role + details layered onto Supabase-managed `auth.users` (PK = FK to `auth.users`). |
| **parent_child_link** | The **many-to-many bridge** linking parents to children. `UNIQUE(parent_id, child_id)`. The linchpin of all family-boundary authorization. |
| **subjects** | O/L subjects. |
| **learning_materials** | Uploaded content (points to a `storage_path` in the `materials` bucket). |
| **quizzes** | Quiz metadata + optional `due_date` (drives lazy due reminders). |
| **quiz_questions** | Questions; `options`/`correct_answer` for MCQ auto-grading. |
| **quiz_attempts** | A child's submission: `score`, `max_score`, `answers`, **`question_scores`** (per-question marks), **`graded`** (false while short answers await marking). |
| **student_activity** | Every view/download/video-watch/quiz event — **the behavioural data that feeds the predictor**. |
| **monitoring_sessions** | A parent's monitoring session: duration, `pages_viewed`, `history_checks`, `camera_enabled`, `liveness_passed`, and focus-mode fields `focus_losses` (times the parent left the portal) + `away_seconds`. |
| **attention_scores** | Camera output (Phase 7): `attention_score` (0–1), `attentive_seconds`, `total_seconds`. **Numbers only, never video.** One row per session, upserted as the camera runs. |
| **engagement_index** | The rule-based PEI output per child per period. Also where the predictor reads its parental features. |
| **academic_records** | Term assessment/exam scores + attendance %. |
| **predictions** | Predictor output: `risk_band`, `risk_score`, `top_factors` (JSON explanation). |
| **messages** | Two-way parent↔admin messaging. |
| **intervention_notes** | Admin-only private staff case log (Phase 6). Never shown to parents/children. |
| **notifications** | In-app parent notifications (4 types); `read_at` drives the engagement-scoring hook. Created only by the backend. |
| **report_cards** | Admin-uploaded PDF per student per term (`report-cards` bucket). |

### 5.3 Relationships

- Every domain table hangs off **`profiles`**, which itself extends
  `auth.users` (so identity, role, and data are one chain).
- **`parent_child_link`** is the many-to-many join between two `profiles` rows —
  a parent can have many children; a child can have many guardians. This one
  table is what guarantees *"a parent never sees another family's child."*
- **Data-flow chains:** `student_activity` + `quiz_attempts` + `academic_records`
  + `engagement_index` → **features** → `predictions`. And
  `monitoring_sessions` → `attention_scores` + `engagement_index`.

### 5.4 Row-Level Security (RLS) — the "golden rule"

**RLS is enabled on every one of the 16 tables**, so nothing is world-readable by
default. But the project's rule is:

> **All role/ownership authorization runs in the FastAPI application code, using
> the Supabase service-role client (which bypasses RLS). RLS is only a backstop.**

- A few **simple reads** have RLS policies and go direct to Supabase:
  `profiles` (read your own row), `parent_child_link` (read links where you are
  the parent or child — *the policy that stops cross-family reads*), and
  authenticated-read policies on `subjects`, `learning_materials`, `quizzes`,
  `quiz_questions`.
- **Everything sensitive** (`quiz_attempts`, `student_activity`,
  `monitoring_sessions`, `attention_scores`, `engagement_index`,
  `academic_records`, `predictions`, `messages`, `intervention_notes`,
  `notifications`, `report_cards`) has **RLS on but no policies** — it is
  therefore **never client-readable**; it can only be reached through the API,
  which applies its own checks.

**Profile-creation trigger:** `handle_new_user()` (a `SECURITY DEFINER` trigger)
fires after a new `auth.users` row is inserted and creates the matching
`profiles` row. This avoids a client-side insert racing the session (no session
yet → `auth.uid()` is null → RLS would reject), so `profiles` needs no insert
policy.

### 5.5 Storage buckets

- **`materials`** (private) — learning content.
- **`report-cards`** (private) — term PDF report cards.

Both are private; all up/downloads go through FastAPI with the service-role key,
which issues **time-limited signed URLs** (3600s) on download.

---

## 6. Backend & API

*(Source: `app/backend/app/…` — `main.py`, `config.py`, `auth/`, `db/`, `routers/`, `services/`.)*

### 6.1 The "RLS-vs-API golden rule" in practice

Authorization is enforced in two layers in the application code:

1. **Role guard** — `require_role("admin")` etc., a FastAPI dependency that
   raises **403** if `user.role` isn't allowed.
2. **Ownership check** — for parent endpoints, `_assert_linked(parent_id,
   child_id)` / `_assert_access(...)` verify a `parent_child_link` row exists,
   raising **403 "Not linked to this child"** otherwise. Role alone is never
   enough — a parent must be *linked* to the specific child.

### 6.2 Authentication

- The browser sends `Authorization: Bearer <supabase-jwt>`.
- The token is verified via **Supabase's JWKS endpoint** using **asymmetric keys
  (ES256/RS256)** — *not* the legacy shared secret. Verification checks
  `audience="authenticated"` and allows `leeway=10s` for clock skew.
- The user's **role is read from the `profiles` table**, not from the JWT — the
  token authenticates *identity*; the database is the source of truth for
  *authorization role*. (A useful nuance to know: `SUPABASE_JWT_SECRET` is present
  in config but unused by request verification, precisely because verification
  uses JWKS.)

### 6.3 Endpoint inventory (~40 endpoints, 14 routers)

Guard legend: **any** = any authenticated user · **admin/parent/child** = that
role · **P+A** = parent or admin.

**Health / Profiles**
| Method · Path | Guard | Description |
|---|---|---|
| GET `/health` | none | Liveness probe. |
| GET `/profiles/me` | any | The caller's own profile. |

**Admin** (`/admin`)
| Method · Path | Guard | Description |
|---|---|---|
| GET `/admin/users` | admin | List all profiles. |
| POST `/admin/users` | admin | Create an auth user + set its real role. |
| PATCH `/admin/users/{id}` | admin | Update name/role/grade. |
| DELETE `/admin/users/{id}` | admin | Cascade-delete a user's data, then the user (blocks self-delete). |
| POST `/admin/links` | admin | Link a parent to a child. |
| GET `/admin/links` | admin | List all parent-child links. |
| DELETE `/admin/links/{id}` | admin | Remove a link. |

**Subjects / Materials**
| Method · Path | Guard | Description |
|---|---|---|
| GET `/subjects` | any | List subjects. |
| POST `/subjects` | admin | Create a subject. |
| PATCH `/subjects/{id}` | admin | Rename, re-grade, or flip core/optional (flipping to core clears its `child_subjects` rows). |
| DELETE `/subjects/{id}` | admin | Delete a subject. **409** when any material, quiz or academic record still references it — the message names the counts. |
| GET `/materials` | any | List materials (optional subject filter). |
| POST `/materials` | admin | Upload a material file. |
| GET `/materials/{id}/download` | any | Signed URL (graceful 404 if the file is missing). |

**Quizzes** (`/quizzes`)
| Method · Path | Guard | Description |
|---|---|---|
| GET `/quizzes` | any | List quizzes (admins also get attempt counts). |
| GET `/quizzes/attempts/me` | child | The child's own attempts. |
| GET `/quizzes/{id}/attempts` | admin | All attempts for a quiz (with child names). |
| GET `/quizzes/{id}` | any | One quiz + questions (**answer key stripped for children**). |
| POST `/quizzes/{id}/attempts` | child | Submit answers; MCQs auto-graded. |
| POST `/quizzes/attempts/{id}/grade` | admin | Award short-answer marks; recompute score. |
| POST `/quizzes` | admin | Create a quiz + questions. |
| PATCH `/quizzes/{id}` | admin | Title / subject / due date. Always allowed — none of it invalidates a submitted attempt. |
| PUT `/quizzes/{id}/questions` | admin | Replace the question set, recompute `total_marks`. **409** once any attempt exists. |
| DELETE `/quizzes/{id}` | admin | Delete a quiz + its questions. **409** once any attempt exists. |

> **Why the two 409s.** `quiz_attempts` snapshots `max_score` and keys
> `question_scores` by question id. Rewriting the paper after a sitting would
> leave stored marks scored out of a total that no longer exists, against
> questions that no longer exist — and those attempts feed the performance
> predictor. Both guards count references in application code rather than
> letting Postgres raise a foreign-key error: it gives the admin a message that
> says what to do next, and it is the only version the test suite can exercise
> (the in-memory fake client enforces no constraints).

**Activity / Parent**
| Method · Path | Guard | Description |
|---|---|---|
| GET `/activity/me` | child | The child's own activity log. |
| POST `/activity` | child | Log an activity event. |
| GET `/parent/children` | parent | The parent's linked children. |
| GET `/parent/children/{id}/activity` | parent | A linked child's activity. |
| GET `/parent/children/{id}/quiz-attempts` | parent | A linked child's attempts. |
| GET `/parent/sessions` | parent | The parent's monitoring sessions. |
| GET `/parent/attention-history` | parent | All attention scores across the parent's sessions. |
| POST `/parent/sessions` | parent | Start a monitoring session. |
| POST `/parent/sessions/{id}/ping` | parent | Increment pages_viewed / history_checks. |
| POST `/parent/sessions/{id}/end` | parent | End a session. |
| POST `/parent/sessions/{id}/attention` | parent | Store camera attention (numbers only); upserts one row per session. |
| POST `/parent/sessions/{id}/focus-loss` | parent | Log one focus-mode interruption (increments `focus_losses`, adds `away_seconds`). |

**Predictions / Engagement / Students (admin) / Analytics**
| Method · Path | Guard | Description |
|---|---|---|
| GET `/predictions/{child_id}` | P+A | Latest prediction (computes if none). |
| POST `/predictions/run` | admin | Batch-predict all children; alerts parents on *worsened* bands. |
| GET `/engagement/{child_id}` | P+A | The child's Parental Engagement Index. |
| GET `/engagement/{child_id}/history` | P+A | PEI history (for the trend chart). |
| GET `/admin/students/roster` | admin | Risk-sorted class roster. |
| GET `/admin/students/{id}` | admin | Per-student aggregate view. |
| GET `/admin/students/{id}/notes` | admin | Intervention notes. |
| POST `/admin/students/{id}/notes` | admin | Add an intervention note. |
| POST `/admin/students/{id}/grades` | admin | Record a term's assessment / exam / attendance. **409** on a duplicate term for that student. |
| PATCH `/admin/students/{id}/grades/{record_id}` | admin | Edit one record. A single score can be cleared to null, but not every score at once. |
| DELETE `/admin/students/{id}/grades/{record_id}` | admin | Remove a record. |

> `academic_records` is the performance axis of the Insights scatter and a
> direct feature of the risk model, and until these routes existed nothing in
> the application could write it — grades could only be seeded or inserted by
> hand in SQL. Percentages are range-checked at the edge because a typo'd 850
> would quietly skew both the cohort correlation and the model's inputs.

| GET `/admin/analytics/engagement-performance` | admin | Engagement-vs-performance scatter + Pearson `r`. |

**Notifications / Report cards**
| Method · Path | Guard | Description |
|---|---|---|
| GET `/notifications` | parent | List notifications + generate lazy due reminders. |
| POST `/notifications/{id}/read` | parent | Mark one read (the engagement-scoring hook). |
| POST `/notifications/read-all` | parent | Mark all read. |
| POST `/admin/students/{id}/report-cards` | admin | Upload a report-card PDF. |
| GET `/admin/students/{id}/report-cards` | admin | List a child's report cards. |
| GET `/admin/report-cards/{id}/download` | admin | Signed URL. |
| DELETE `/admin/report-cards/{id}` | admin | Delete file then row. |
| GET `/parent/children/{id}/report-cards` | parent | A linked child's report cards. |
| GET `/parent/report-cards/{id}/download` | parent | Signed URL (asserts link). |

### 6.4 Notifications service

Four event types — `quiz_result`, `quiz_due`, `report_card`, `risk_alert` — each
fanned out to **all** linked parents (a child may have several guardians).
Notifications are **created only by the backend** (no public create endpoint).
Key behaviours:

- **Dedup:** the lazy `quiz_due` generator runs on every `GET /notifications`, so
  it skips creating a reminder if *any* copy already exists (read or unread),
  preventing a resurrect-on-every-load loop.
- **`notify_safe`:** every notifier is wrapped so a notification failure is
  *logged but never fails the underlying action* (a quiz submit / prediction run /
  upload always succeeds).
- **Reading feeds engagement:** marking a notification read (`read_at`) is counted
  into the parent's `check_frequency` — so responsiveness raises the PEI **with no
  new ML feature and no retrain** (§7.5).

---

## 7. The machine-learning system

*This is the core intellectual contribution — read this section carefully for the
viva.*

### 7.0 How many models? (model inventory)

A common opening question. The precise answer: **we trained exactly one model.**
The full inventory is:

| # | Component | Type | Trained by us? | Shipped? |
|---|-----------|------|----------------|----------|
| 1 | **Performance-risk predictor** (Random Forest) | Machine learning (classifier) | **Yes — the one trained model** | ✅ `predictor_v1` |
| 2 | Logistic Regression | ML benchmark | Trained only to compare | ❌ Not shipped |
| 3 | Gradient Boosting | ML benchmark | Trained only to compare | ❌ Not shipped |
| 4 | **Camera face landmarker** (MediaPipe FaceLandmarker, 478 points) | Pre-trained deep model | **No — used as-is** | ✅ (runs in-browser) |
| 5 | **Parental Engagement Index (PEI)** | Rule-based weighted formula | N/A — *not* ML, nothing is learned | ✅ |
| — | Attention-quality classifier (scope B) | ML | **Deliberately not built** (out of scope) | ❌ |

**One-line summary for the viva:** *"One trained model (the explainable Random
Forest risk predictor), selected after benchmarking two alternatives; one
pre-trained model used as-is (MediaPipe, for the camera); and one transparent
rule-based scorer (the PEI, which is not machine learning). An attention-quality
classifier was scoped but deliberately dropped."*

This lean strategy is intentional — a single, well-understood, **explainable**
trained model serves the thesis better than a stack of black boxes, and the
camera task correctly reuses a proven pre-trained model rather than training one
from scratch (which would need a large labelled face dataset the project doesn't
have).

### 7.1 The predictor model

| Property | Value |
|----------|-------|
| **Algorithm** | `RandomForestClassifier` (scikit-learn), committed as the production model |
| **Hyperparameters** | `n_estimators=300`, `max_depth=None`, `random_state=42` |
| **Pipeline** | Single `clf` step, **no scaler** (trees don't need feature scaling) |
| **Train/test split** | **75% / 25%, stratified** on the risk band, seed 42 |
| **Cross-validation** | 5-fold, macro-F1 scoring |
| **Target** | `risk_band` — three ordinal classes: **low / medium / high** |

Two benchmark models were also trained for comparison: **Logistic Regression**
(with `StandardScaler`) and **Gradient Boosting**.

### 7.2 The 9 input features (frozen order)

The feature contract lives in one file (`features.py`) shared by **both** the
training pipeline and the serving layer, guaranteeing the vector is built
identically at fit-time and predict-time. The order is frozen into the model's
sidecar meta file; reordering would require a retrain.

| # | Feature | Meaning | Source |
|---|---------|---------|--------|
| 1 | `quiz_avg_pct` | Mean quiz score ratio (0–1) | quiz_attempts |
| 2 | `quiz_count` | Number of attempts | quiz_attempts |
| 3 | `material_activity` | Count of activity events | student_activity |
| 4 | `avg_watch_percent` | Mean video watch % | student_activity |
| 5 | `attendance_pct` | Attendance % | academic_records |
| 6 | `prior_avg_score` | Mean of past assessment + exam scores | academic_records |
| 7 | `monitoring_hours` | Parent monitoring hours | engagement_index |
| 8 | `check_frequency` | Parent check-ins | engagement_index |
| 9 | `parental_attention` | Camera attention score (0–1) | engagement_index |

**Missing-data policy:** all missing signals default to 0 — a child with no data
reads as low-engagement, which correctly surfaces as elevated risk — **except**
`parental_attention`, which defaults to the neutral **0.5 placeholder** until the
camera supplies real values.

### 7.3 Why Random Forest (explainability over raw accuracy)

The thesis deliberately commits to an **explainable tree ensemble**, for two
reasons:

1. **Tree ensembles beat neural networks on tabular data.**
2. **Explainability is the point.** The model must justify *why* a child is at
   risk — the feature importances **are** the parental-factor argument. A
   black-box would defeat the research purpose.

The training code benchmarks all three models but keeps Random Forest unless a
challenger clearly beats it on cross-validated F1 (threshold > 0.03), which it
doesn't. **Honest note for the viva:** on the held-out set, Gradient Boosting is
marginally ahead and Logistic Regression has the best CV macro-F1 — the models
are within ~1% of each other, and RF was chosen for explainability, not because
it dominated every metric. This is a defensible, transparent choice.

### 7.4 Evaluation metrics (predictor_v1, the winning RF)

| Metric | Value |
|--------|-------|
| Accuracy | **0.7452** |
| Precision (macro) | 0.7705 |
| Recall (macro) | 0.7394 |
| **F1 (macro)** | **0.7521** |
| CV F1 (macro) mean ± std | 0.7281 ± 0.037 |

Trained on **1,680 rows** (1,200 simulated + 480 recast from real xAPI data).

**Feature importances** (why the model decides what it does):

| Feature | Importance |
|---------|-----------|
| prior_avg_score | **0.218** (most important) |
| quiz_avg_pct | 0.163 |
| attendance_pct | 0.129 |
| monitoring_hours | 0.098 |
| quiz_count | 0.097 |
| avg_watch_percent | 0.089 |
| material_activity | 0.081 |
| check_frequency | 0.067 |
| parental_attention | 0.059 (least important) |

### 7.5 Training data generation (the simulated dataset)

*Why simulate?* The model may only use features the project's own database holds,
and **no public dataset ships in that exact feature schema**. So the approach is:
**mine public datasets for the documented statistical relationships, then
reproduce those relationships in a simulated Sri Lankan O/L dataset** that lives
in the exact feature schema.

**Public datasets used for grounding:**
- **xAPI-Edu-Data** (480 records) — the primary grounding set because it carries
  *parental* fields (`ParentAnsweringSurvey`, `ParentschoolSatisfaction`,
  `Relation`). Evidence extracted, e.g.: parental survey *Yes → 1.32 vs No → 0.66*
  mean outcome; absences *under-7 → 1.44 vs above-7 → 0.41*.
- **UCI Student Performance** — family-context features (parent education, family
  support, family relationship quality).
- **OULAD** (Open University Learning Analytics Dataset) — large behavioural
  clickstream reference (no parental fields; optional).

**Generation procedure** (seed 42, reproducible):
1. A single **latent factor** (`Beta(2.2, 2.2)`) represents an "engaged
   household + able student," so features correlate realistically.
2. Each feature = base + slope·latent + Gaussian jitter, then clipped to a
   realistic range.
3. A weighted **success score** (weights echo the literature: prior grades 0.24,
   quiz avg 0.20, attendance 0.15, parental involvement ~0.30 combined, passive
   activity minor) + label noise → mapped to a **risk band** (success ≥ 0.60 →
   low, ≥ 0.42 → medium, else high — note the inversion: high success = low risk).

Every row is tagged with `data_source` (`simulated_sl` or `xapi`) for full
transparency. Real xAPI rows are recast into the schema (features from behavioural
columns, label from the outcome class) so a slice of **real** behavioural data is
included.

### 7.6 The Parental Engagement Index (PEI) — a formula, not ML

The PEI is a **transparent weighted formula** — *nothing is learned* — chosen for
explainability:

```
PEI = 0.4 · norm(monitoring_hours)      (cap 10 h)
    + 0.3 · norm(check_frequency)       (cap 25)
    + 0.3 · parental_attention          (0.5 placeholder until the camera)
```

- **monitoring_hours** = sum of session durations.
- **check_frequency** = explicit history-checks **+** the count of notifications
  the linked parent(s) have *read* (responsiveness folded into the existing
  signal — no new ML feature, no retrain).
- **parental_attention** = average camera attention score (0.5 until Phase 7
  readings exist).

The normalisation caps deliberately **match the caps used when generating the
training data**, so a PEI computed at runtime is comparable to the parental
features the model was trained on. The `engagement_index` table is both a product
surface *and* the source of the predictor's three parental features.

### 7.7 Serving path & explanations

- The model (`predictor_v1.pkl`) + its meta sidecar are loaded once and cached.
- For a prediction, the feature vector is rebuilt **in the frozen order** as a
  named-column DataFrame, then `predict_proba` gives class probabilities;
  `risk_band` = arg-max class, `risk_score` = that probability.
- **Explanations (`top_factors`):** the top-4 features by *global* importance are
  each compared against a population midpoint to say whether the child's value
  *raises* or *lowers* risk, producing plain-language lines like *"prior grades is
  low → raises risk."*
  - **Honest nuance:** these are **global importance rankings**, not per-child
    SHAP attributions — so the same 4 factors appear for every child; only the
    values/direction are personalised.
- **Batch run** (`POST /predictions/run`, admin): predicts every child, stores the
  result, and notifies linked parents **only when a child's band worsened** (never
  on a first-ever prediction).

### 7.8 The feedback loop (worth citing)

Reading a risk alert increases the parent's `check_frequency` → raises the PEI →
which feeds the predictor's parental features on the next run. Parental
responsiveness thus measurably flows back into the model — without changing the
model itself.

---

## 8. The camera attention feature (the novelty)

*(Phase 7 · scope **A + E** = attention verification + liveness safeguard,
supervisor-approved. Directory `frontend/src/lib/attention/` + `SessionCamera.tsx`.)*

This is the project's research novelty: **the camera points at the parent** to
verify genuine attention, entirely in the browser. As of the session-long revision
(2026-07), the camera runs for the **whole login** rather than as a manual per-child
toggle — reflecting the monitoring intent that a parent's attention is observed
throughout their monitoring visit, not only in short bursts.

### 8.1 Perception pipeline

1. **Face landmarking** — MediaPipe's pre-trained **478-point FaceLandmarker**
   runs at ~8 fps on the hidden self-view video (GPU delegate, used as-is).
2. **Liveness check first** (the "E" safeguard) — confirms a *real person* via a
   **blink** (eye-aspect-ratio dips then recovers) **or deliberate head motion**
   (yaw sweep). Times out after 8s → "couldn't confirm a live person," retryable.
3. **Eyes-on-screen heuristic** — attentive only if the iris is roughly centred
   in both eyes **and** the head faces forward (within thresholds).
4. **Accumulation with debouncing** — attentive-vs-total seconds accrue per
   frame; a **1.5s grace window** means a blink or momentary glance doesn't chip
   away at the count; large frame gaps are capped so a stall can't inflate totals.
5. **Anti-gaming** — switching to another tab counts as **inattentive** (total
   advances, attentive doesn't), closing the "leave the page open elsewhere"
   loophole.

### 8.2 Session-long lifecycle (2026-07 revision)

- **Consent once per login** — on entering the portal a modal explains the
  on-device processing, no-video guarantee, the liveness check and the on-air
  indicator. On accept the camera starts and stays on **until logout**; declining
  keeps monitoring behaviour-only. (The manual "Stop camera" button and the former
  3-minute minimum lock were removed — the lifecycle is now tied to login/logout.)
- **Per-session attribution by deltas** — the accumulator counts cumulatively from
  camera start. Attention is attributed to whichever child's `monitoring_session`
  is active: when the active session changes, and on logout, the **delta**
  (`Δattentive`, `Δtotal`) accrued since the last boundary is POSTed to the session
  that was active, then rebased. Time with no child selected is not recorded.
- **Reliable persistence** — the running total for the active session is saved
  every ~15 s (in addition to boundary/logout flushes). This keeps the attention
  history live **and** guarantees the reading survives logout: the unmount flush
  cannot authenticate once `signOut` has cleared the token, so the last interval
  save is what lands. The backend **upserts one `attention_scores` row per session**
  (updated in place), which also keeps the engagement scorer's per-session average
  correct.
- Only `{attentive_seconds, total_seconds, liveness_passed}` is ever sent to
  `POST /parent/sessions/{id}/attention`. **No video or frames leave the browser.**

### 8.3 Focus mode — monitoring-interruption tracking (2026-07)

A website **cannot** technically prevent a user from switching tabs or visiting
other sites (browsers forbid it for security), so focus mode **detects and deters**
rather than blocks:

- **`useFocusGuard`** watches `visibilitychange` and window `blur`/`focus`. If the
  portal loses focus for more than a **5-second grace** (to ignore momentary blur),
  it raises an `away` state. Intentional new-tab actions (e.g. a report-card
  download via `window.open`) call `suppress()` so they are not counted as leaving.
- **`FocusGuardOverlay`** renders a full-screen *"Monitoring paused"* overlay that
  blocks the portal on return until the parent acknowledges (**Resume monitoring**).
- **Consequence** — each leave is logged to the session via
  `POST /parent/sessions/{id}/focus-loss` (new `focus_losses` count and
  `away_seconds` columns on `monitoring_sessions`), surfaced in the Monitoring
  Sessions view; tab-switch away-time also already lowers the attention score via
  the accumulator. Fullscreen was deliberately **not** used (Esc always exits it).
- **Stated limitation (thesis-relevant):** this is enforcement-by-visibility, not
  true lockdown. Genuine prevention would require a kiosk/managed device or a
  desktop wrapper (e.g. Electron), which is outside the web application.

### 8.4 Privacy & testability by design

- The geometry (gaze, liveness, accumulation) is written as **pure functions**,
  so it is unit-testable with fixtures, and a `MockAttentionTracker` (toggled by a
  window flag) enables full end-to-end flow testing **without a real webcam**.
- Camera denied/absent → a graceful message; monitoring continues *behaviour-only*
  and engagement falls back to the neutral 0.5 attention placeholder (no schema
  change needed — the "socket" pre-existed).

---

## 9. Frontend & feature walkthrough by role

*(React SPA; role-based routing via `ProtectedRoute` + `RoleRouter`. Auth state
from `AuthContext`; every API call attaches the fresh Supabase JWT as a bearer
token.)*

### 9.1 Admin portal
Sidebar: **Users · Parent↔Child Links · Materials · Quizzes · Risk Predictions ·
Insights**, plus a **Student Detail** page (a real route).

- **Users** — role summary cards (also filters), searchable/paginated user table,
  create/view/edit/delete accounts, and role-distribution charts.
- **Links** — create/list/delete parent-child links.
- **Materials** — subjects, upload (multipart), type filters, signed-URL
  downloads.
- **Quizzes** — create quizzes (dynamic MCQ / short-answer builder, optional due
  date), view (highlights the correct MCQ option), and **Results** (stats +
  attempts table). Short-answer attempts show **"Needs grading"** with a grading
  modal (student answer + model answer + bounded mark input → `POST …/grade`).
- **Risk Predictions** — risk-sorted roster (click a row → student detail), a
  **"Run predictions"** button, and a model-health card of held-out metrics.
- **Insights** — the engagement-vs-performance scatter with a least-squares trend
  line and an auto-generated correlation headline, labelled *"association, not
  causation (simulated cohort)."*
- **Student Detail** — risk card with explainable factors, academic records,
  **report-card upload/list/download**, recent activity, and the private
  **intervention-notes** case log.

### 9.2 Parent portal
Sidebar: **Overview · Notifications (unread badge) · Activity History · Quiz
Scores · Report Cards · Monitoring Sessions · Attention History**, with a top
child selector.

- Selecting a child **opens a monitoring session**; navigating sends `ping`s
  (pages viewed / history checks); switching child ends the session — this is the
  real behavioural data the PEI consumes.
- The **SessionCamera** (camera) is mounted at portal level and runs for the whole
  login (consent once per login); attention is attributed to the active child's
  session. **Focus mode** (`useFocusGuard` + `FocusGuardOverlay`) detects leaving
  the portal and blocks it on return, logging each interruption to the session.
- **Overview** — the engagement index (**LampGauge**), a component breakdown, the
  disclosed formula, an engagement-over-time trend, the **PredictionCard** (band +
  confidence + top factors + a low/medium/high scale), and activity/score charts.
- **Notifications** — click to mark read, deep-link to the relevant section.
- Other sections — paginated activity, quiz scores (ungraded → "Awaiting
  grading"), report-card downloads, monitoring-session history, and attention
  history with a trend.

### 9.3 Child portal
Sidebar: **Learn · My Progress.**

- **Learn** — subject cards → materials (videos play inline and log watch %; PDFs
  and images open in an **in-app modal viewer**) and quizzes (with a "best %"
  badge). Taking a quiz uses a modal; **the answer key is never sent to the
  child**. Results show the auto-graded score and note short answers are graded
  separately.
- **My Progress** — score trend, recent activity, quiz scores. **No risk
  prediction is ever shown to the child.**

### 9.4 Cross-cutting frontend facts
- **Two backends bridged by the JWT:** Supabase (auth + profile + storage) and the
  custom FastAPI REST API. Role comes from the DB profile, not JWT claims.
- **Best-effort loading:** prediction/engagement/notification failures are
  swallowed so one missing dataset never blocks a portal.
- **Client-side pagination** everywhere (page numbers with ellipses); data is
  fetched per child/subject and paged in memory.

### 9.5 The "Aurora Glass" design system
Indigo (`#4F46E5`) primary, violet (`#9333EA`) accent, clay (`#C9553B`) for risk,
on a cool canvas. Fonts: Bricolage Grotesque (display), Plus Jakarta Sans (body),
IBM Plex Mono (the small "eyebrow" labels). A rich CSS-only motion library
(all disabled under `prefers-reduced-motion`), a signature **LampGauge** for
engagement, and dark mode as a persisted, class-based toggle. Chart palettes are
independently validated for colour-vision-deficiency separation.

---

## 10. Development phases & rationale

The guiding principle: **the schema included the camera's "socket"
(`attention_scores`, `camera_enabled`) from day one**, so Phase 7 needed no
schema change or rework when it landed. Only Phase 5 required a dataset.

| Phase | What was built | Why |
|-------|----------------|-----|
| **0 — Setup** | React+FastAPI+Supabase scaffold, buckets | Get a deployable, connected skeleton first. Supabase bundles Auth + roles + Storage + RLS. |
| **1 — Auth & roles** | Supabase Auth, `profiles`, no self-signup, parent↔child linking, RLS | Matches a school issuing credentials; the link policy prevents cross-family reads. |
| **2 — Admin content** | Subjects, materials (private bucket + signed URLs), quizzes | Writes via API + service-role + admin guard; reads opened to authenticated users so later phases need no new policies. |
| **3 — Child learning** | My Learning, inline video (logs watch %), quizzes | The answer key is stripped for children; every event logged to `student_activity` (predictor fuel); child never sees risk. |
| **4 — Parent monitoring** | Child selector, monitoring sessions (ping/end), tabs | Produces real behavioural data (duration, pages, checks) for the PEI; `attention_scores` reserved for Phase 7. |
| **5 — ML (the thesis core)** | Feature contract, data prep + simulation, PEI, trained RF predictor, serving | The one trained model. Explainable RF; honest simulated-data framing; feature importances ARE the argument. |
| **6 — Dashboards** | Risk roster, student detail + intervention notes, engagement trend | Integration/polish; notes are a private staff log (support-not-blame); verified in-browser. |
| **7 — Camera (novelty)** | Client-side MediaPipe attention + liveness, consent, POST numbers only | Camera on the *parent* — the MMLA contribution. Scope A+E, no video storage, supervisor-approved. |
| **+ Notifications & report cards** | 4 event types, lazy due reminders, report-card PDFs | In-app only; reads feed engagement (no retrain). |
| **+ Short-answer grading** | Admin grades short answers; parent notified once complete | MCQs auto-grade; no misleading partial score is announced. |

*Also:* the original **teacher role was removed** and folded into admin (a school
admin manages content), simplifying the role model to admin/parent/child.

---

## 11. Key engineering decisions & why

- **Thread-local Supabase client.** FastAPI runs sync handlers on a threadpool.
  One client cached *per thread* gives connection reuse (avoids a ~220ms rebuild
  per request) **without** sharing one HTTP connection pool across threads —
  which was causing intermittent `RemoteProtocolError` disconnects.
- **The "phantom CORS" fix.** Starlette's default 500 is generated *outside* the
  CORS middleware, so it lacks the CORS header and the browser misreports it as a
  CORS error. A global exception handler makes the JSON 500 keep its CORS header,
  and missing-storage-file errors are converted to a clean **404** with an
  actionable message ("re-upload this file") for the same reason.
- **Lazy notification generation.** There's no cron in the prototype, so
  `quiz_due` reminders are generated on demand when a parent loads their
  notifications, with dedup so a read reminder isn't regenerated.
- **Manual upsert-by-key.** Some tables have no unique constraint, so predictions
  and the engagement index are upserted by hand (check-then-update-or-insert).
- **`notify_safe` everywhere.** A notification failure can never fail a quiz
  submit / prediction run / upload.
- **Answer-key stripping** for the child role; **short-answer notification
  deferred** until fully graded (no misleading partial score).

---

## 12. Limitations & honest scope

Stating these openly is a strength in a viva:

1. **The predictor is trained on simulated data.** No public dataset carries the
   exact feature combination, so data is generated in-schema and grounded in
   public-dataset relationships. Consequently, the ~74.5% accuracy and the factor
   explanations reflect the **simulated relationships**, framed as **association,
   not causation**. Real deployment needs retraining on a consented real cohort.
2. **Camera attention needs a real-device calibration pass.** Gaze thresholds
   were tuned against controlled input, not a range of webcams/lighting/faces —
   treat the attention % as an **indicative signal**.
3. **The PEI is a transparent formula, not ML** — by design (explainability), so
   it reflects the chosen weights (0.4/0.3/0.3), not a learned relationship.
4. **Explanations are global-importance rankings, not per-child SHAP** — the same
   top factors appear for every child; only values/direction personalise.
5. **`parental_attention` is currently a 0.5 placeholder** in the training data
   and is the least-important feature — the real camera signal is new and would
   strengthen with real data.
6. **Scope decisions:** one trained model + one pre-trained (MediaPipe, used
   as-is) + one rule-based scorer; no self-signup; no email/SMS/push; parent
   identity face-matching deliberately **not** built (biometric PII + ethics
   burden; liveness already confirms a real person).

---

## 13. Anticipated viva questions & answers

**Q: What is your actual research contribution?**
A: Objective, **camera-verified measurement of parental attention**. The
parental-involvement→performance link is already established; my contribution is
applying Multimodal Learning Analytics techniques to a new subject — the *parent*
— to replace unreliable self-reports with an on-device attention measurement.

**Q: Why simulated data? Isn't that a weakness?**
A: No public dataset contains the exact combination of behavioural + parental
features per O/L student. Rather than force a mismatched dataset, I *mined public
datasets (xAPI, UCI) for the documented relationships* and reproduced them in a
simulated dataset in my exact feature schema, plus recast 480 real xAPI rows. I
demonstrate the **method and pipeline**; I frame every result as **association,
not causation**. It's a transparent, defensible scope — and every row is tagged
with its `data_source`.

**Q: Why Random Forest and not deep learning?**
A: Two reasons. First, tree ensembles outperform neural networks on tabular data.
Second — and decisively — **explainability**: the feature importances *are* my
argument about which parental factors matter. I benchmarked Logistic Regression
and Gradient Boosting too; they're within ~1%, and I kept RF for explainability
rather than because it dominated every metric. That honesty is itself defensible.

**Q: Your accuracy is ~75% — is that good?**
A: On a three-class problem, chance is ~33%, so 0.75 accuracy / 0.752 macro-F1 is
a solid, balanced result. But I'm careful: these numbers are on simulated + xAPI
data, not real O/L students, so they validate the *pipeline*, not a real-world
effect size.

**Q: How does the model explain itself?**
A: For each child I surface the top-4 features by global importance, compared
against a population midpoint, as plain-language "raises/lowers risk" statements
with the child's own value. I'm transparent that these are **global importance
rankings, not per-child SHAP attributions** — a clear next step would be SHAP for
local explanations.

**Q: How do you protect one family's data from another?**
A: Every table has RLS enabled, and the sensitive tables have *no* client-read
policies — they're reachable only through my API, which runs on the service-role
key and enforces role **and** ownership. A parent endpoint always verifies a
`parent_child_link` row exists for that exact child, returning 403 otherwise.

**Q: Isn't a camera on a parent an ethics problem?**
A: I designed for it. All processing is **in the browser**; only a computed
attention number and duration are stored — no video or frames ever leave the
device. There's an explicit consent gate, a visible on-air indicator, and a
liveness check. I also acknowledge that real data collection would require a
formal ethics-committee review, given minors and a webcam.

**Q: How do you stop the parent gaming the attention timer?**
A: A liveness check confirms a real person (blink or head motion); switching
tabs counts as inattentive; frame-gap caps stop a stalled tab inflating totals;
and a 3-minute minimum must accrue before the session can be stopped.

**Q: Why doesn't the child see their risk score?**
A: A "high risk of failure" label can be self-fulfilling for a teenager. Risk is
visible only to admins and parents, and always in supportive, non-blaming
language.

**Q: What would you do next / with more time?**
A: Retrain on a real consented cohort; a real-device gaze-calibration pass;
per-child SHAP explanations; and (if ethics approve) fold the real camera
attention signal into training rather than the 0.5 placeholder.

---

*End of document. For installation steps, see `SETUP_GUIDE.md`; for the
phase-by-phase status, see `README.md`.*
