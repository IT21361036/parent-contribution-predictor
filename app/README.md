# O/L LMS with Parental Monitoring

Role-based Learning Management System (admin, parent, child) for studying
how parental monitoring relates to O/L student performance in Sri Lanka. See
`../plans/` for the full design and phase-by-phase build plan. The parental
camera/attention component (Phase 7) is deferred until supervisor approval —
everything in this repo up to Phase 6 works without it.

## Structure

```
app/
  frontend/    React + TypeScript + Tailwind (Vite)
  backend/     FastAPI (Python)
  supabase/    schema.sql — paste-ready DDL + RLS policies
```

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and create a new project (free tier is fine).
2. Once it's provisioned, open **SQL Editor** and paste in the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), then run it. This creates every
   table for all 8 phases plus the Phase 1 RLS policies.
3. Open **Project Settings → API** and copy three values:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (keep this secret — it bypasses RLS)
4. Open **Project Settings → API → JWT Settings** and copy the **JWT Secret**.

## 2. Backend setup (FastAPI)

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env            # then fill in the 3 Supabase values + JWT secret
uvicorn app.main:app --reload --port 8000
```

Visit http://127.0.0.1:8000/docs for interactive API docs.

## 3. Frontend setup (React + Vite)

```bash
cd frontend
npm install
cp .env.example .env            # fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev
```

Visit http://localhost:5173.

## 4. Create your first admin account

There's no self-signup — every account is provisioned deliberately by an admin (this
matches the actual plan: a school issues credentials, students/parents don't
register themselves). That means the very first admin has to be created directly:

```bash
cd backend
./.venv/Scripts/activate
python scripts/create_admin.py "you@example.com" "yourpassword" "Your Name"
```

Log in at http://localhost:5173 with those credentials — you'll land on `/admin`.
From there, use the **Admin Console** UI to create parent and child
accounts, link a parent to their child, and manage content (subjects, materials,
quizzes) from the Materials and Quizzes sections of the admin sidebar. (The same actions are also available
directly via `/docs` if you ever need to script bulk account creation.)

## Current status

- **Phase 0 — Project setup:** done (this scaffold).
- **Phase 1 — Auth & roles:** done — admin-provisioned accounts only (no
  self-signup), role-based routing, RLS on `profiles` + `parent_child_link`, an
  Admin Console UI to create parent/child accounts and link parent↔child.
- **Phase 2 — Admin content tools:** done — admins create
  subjects, upload materials (documents/videos/exam papers/slides) to the
  `materials` Supabase Storage bucket with signed-URL downloads, and build
  quizzes with MCQ (auto-graded) or short-answer questions from the Materials
  and Quizzes sections of the Admin Console. (There is no separate teacher
  role — all content/teaching functions are admin capabilities.)
- **Phase 3 — Child learning + activity tracking:** done — the My Learning
  portal lets a child browse subjects, open/download materials (with an
  inline player for videos that logs watch-percent on pause/end), and take
  quizzes (the answer key is stripped from the API response for the `child`
  role and MCQs are auto-graded on submit). Every view/download/video-watch/
  quiz-start/quiz-submit is written to `student_activity`, and the child sees
  their own recent activity and quiz scores — but never a risk prediction
  (that's admin/parent-only, arriving in Phase 5).
- **Phase 4 — Parent monitoring (behavioral):** done — a parent picks one of
  their linked children in the Parent Portal and sees an Overview, Activity
  History, and Quiz Scores tab (authorization is checked against
  `parent_child_link` on every request, not just enforced client-side).
  Selecting a child opens a `monitoring_sessions` row; switching tabs or
  children pings/ends it, so `pages_viewed`, `history_checks`, and session
  duration are real behavioral data the parent can also see logged in a
  "Your monitoring sessions" table. `attention_scores` stays untouched —
  that's still the Phase 7 camera's slot.
- **Phase 5 — ML: engagement scorer + performance predictor:** done — the
  intelligence layer. A Random Forest (chosen for explainability over a black
  box) predicts each child's O/L risk band (low/medium/high) and, crucially,
  *why* — the top contributing factors with the child's own values. Because
  the model may only use features our own DB holds, the training set is
  **simulated on purpose** in that exact feature schema, grounded in the
  statistical relationships mined from public education datasets (UCI Student
  Performance, xAPI-Edu-Data) — framed as association, not causation, with
  every row tagged by `data_source`. A separate transparent **weighted
  formula** (not ML) computes a Parental Engagement Index from
  `monitoring_sessions`. The model is trained offline (`app/ml/train_predictor.py`)
  and saved versioned (`app/ml/models/predictor_v1.pkl` + a `.meta.json`
  sidecar that freezes feature order, class labels and metrics); serving loads
  it and assembles each child's vector in that frozen order. Parents see a
  risk card (band + confidence + explained factors) and their engagement index
  on the Overview; admins get a per-child risk roster with a "Run predictions"
  batch action and model-health metrics in a new Risk Predictions section. All
  ML/role logic runs in FastAPI with the service-role key (RLS-vs-API golden
  rule). Test accuracy ≈ 0.75, macro-F1 ≈ 0.75. Demo data: `python -m
  app.scripts.seed_demo` (idempotent; `--clear` to remove).
- **Phase 6 — Dashboards:** done — the integration + polish pass that ties the
  roles together. Admins get a **risk-sorted class roster** (highest risk first)
  in the Risk Predictions section; clicking a child opens a **student detail
  page** (`/admin/students/:id`) with the prediction + factors, academic records,
  recent activity, and a private **intervention-notes** log (admin-only staff
  case log, backed by a new `intervention_notes` table — never shown to parents
  or children). Parents get an **engagement trend** chart on their Overview
  (engagement index over time). Support-not-blame phrasing on the parent risk
  copy. Verified end-to-end in the browser (admin roster/detail/notes + parent
  trend) via Playwright. New backend router `app/routers/students.py`
  (`/admin/students/roster`, `/admin/students/{id}`, `.../notes`) plus
  `GET /engagement/{child_id}/history` — all admin/parent role logic runs
  server-side with the service-role key (RLS-vs-API golden rule).
- **Phase 7 — Camera (parent attention verification):** built (scope A core +
  E safeguard; supervisor-approved). All video processing is client-side —
  MediaPipe `FaceLandmarker` runs in the browser (`frontend/src/lib/attention/`)
  and **only computed numbers are sent, never video/frames**. On the parent
  Overview a consent gate (opt-in; "no video recorded or uploaded") turns on the
  camera; a short liveness check (blink/head-motion) confirms a real person, then
  an eyes-on-screen heuristic accumulates attentive-vs-total seconds (with
  look-away debouncing) for the monitoring session. A visible camera-on indicator
  + Stop control stay up throughout; on stop the numbers POST once to
  `POST /parent/sessions/{id}/attention` (built the prior session) and the parent
  sees their own attention %. Camera denied/absent → graceful behavior-only
  session (engagement falls back to the 0.5 placeholder). No schema change —
  `attention_scores` + `monitoring_sessions.camera_enabled/liveness_passed` were
  already the socket; the engagement scorer already averages real attention
  scores. New frontend dep `@mediapipe/tasks-vision`. Pure gaze/liveness/
  accumulation logic unit-verified; real-webcam gaze accuracy needs a manual pass.
- **Notifications + report cards:** done (built on top of the 8 phases). In-app
  **notifications** to parents fire on four events — quiz result available
  (auto-graded on submit), quiz due soon (generated lazily in `GET /notifications`
  from `quizzes.due_date`, deduped), report card published, and a **risk alert**
  when a child's predicted band worsens on a prediction run. Parents get a
  **Notifications** sidebar section (unread badge, click-to-open marks read and
  deep-links to the relevant section) and a **Report Cards** section (view/download
  PDFs). Admins upload a **report card PDF per term** from the student detail page
  (private `report-cards` bucket, signed-URL downloads). **Reading a notification
  feeds the engagement score** — the read count is folded into `check_frequency`
  (so parental responsiveness raises the PEI via the existing 30% check-ins
  weight); this is deliberately *not* a new ML feature, so the thesis model is
  unchanged and needs no retrain (responsiveness folded into check-ins). New
  tables `notifications` + `report_cards` and `quizzes.due_date` — see
  `supabase/migrations/2026-07-10-notifications-report-cards.sql` to apply to an
  existing DB. All creation/role logic is API-only with the service-role key
  (RLS-vs-API golden rule); notifications have no public create endpoint.
- **Short-answer quiz grading:** done. MCQs still auto-grade on submit; a quiz
  with any short-answer question is stored `graded=false` and shows **Needs
  grading** in the admin Quiz Results view. An admin awards marks per question
  (bounded by that question's maximum, with the student answer and model answer
  shown) via `POST /quizzes/attempts/{id}/grade`, which recomputes the total
  score and — only once the attempt becomes fully graded — sends the parent the
  `quiz_result` notification (so no misleading partial score is ever announced).
  Child/parent views show **Awaiting grading** and exclude ungraded attempts
  from score trends/averages until then. Per-question marks live in the new
  `quiz_attempts.question_scores` + `graded` columns — see
  `supabase/migrations/2026-07-17-short-answer-grading.sql` to apply to an
  existing DB.

## Running the tests

Backend unit/API tests use `pytest` with an in-memory fake Supabase client
(no live DB or network — auth is overridden and `get_service_client` is patched
per router). From `app/backend`:

```bash
pip install -r requirements.txt   # pulls in pytest + httpx
pytest                            # runs tests/ (grading + engagement formula)
```

Coverage focuses on the logic most worth pinning: quiz grading (MCQ
auto-grade, short-answer pending → admin grade → recompute + notify, mark
bounds, role/ownership guards) and the Parental Engagement Index formula and
its normalisation caps. Frontend correctness is checked with `tsc --noEmit`
(`npm run build` in `app/frontend`).

## Limitations & scope notes

Honest boundaries of this FYP build, so results aren't over-read:

- **The performance predictor is trained on simulated data.** The model may
  only use features our own schema holds, and no public dataset carries that
  exact combination of behavioral + parental-engagement features per O/L
  student. The training set is therefore **generated on purpose** in that
  feature schema (`app/ml/generate_simulated.py`), with the feature–outcome
  relationships grounded in public education datasets (UCI Student Performance,
  xAPI-Edu-Data) and every row tagged by `data_source`. Consequences: the
  reported accuracy (≈0.75) and the SHAP-style factor explanations reflect the
  **simulated relationships**, not validated real-world O/L outcomes; they are
  framed as **association, not causation**. Deploying for real decisions would
  require retraining on a consented cohort of real student data.
- **Camera attention accuracy needs a manual pass.** All gaze/liveness/
  accumulation logic is client-side and unit-verified, but the eyes-on-screen
  gaze thresholds were tuned against controlled input, not a range of real
  webcams, lighting, and faces. Treat the attention % as an **indicative
  signal**, not a precise measurement, until a real-device calibration pass.
  When the camera is denied or absent, engagement gracefully falls back to the
  neutral 0.5 attention placeholder.
- **Parental Engagement Index is a transparent weighted formula, not ML** — by
  design (explainability), so it reflects the chosen weights (0.4/0.3/0.3), not
  a learned relationship.
