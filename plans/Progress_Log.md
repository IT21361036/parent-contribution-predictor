# Progress Log

Running, dated record of what was actually built each session — complements
`Implementation_Plan_Updated.md` (the plan) and `../app/README.md` ("Current
status" section, which always reflects the latest state). Add a new dated
entry at the top each session; don't rewrite history.

---

## 2026-07-10 (Phase 7 camera — UX fixes + next-feature design)

**Phase 7 camera, fixes this session (all typecheck-green):**
- **Self-view added** — mirrored, Teams-style "● You" preview in `AttentionPanel` while
  the real camera is on (mock mode shows none). Local-only; privacy model unchanged.
- **Tab-away now counts as inattentive** — `AttentionAccumulator.addInattentive()` +
  a `visibilitychange` handler in the tracker credit hidden-tab time as *not* attentive
  (was silently frozen before → gameable). Liveness window excludes hidden time.
- **Camera survives sidebar navigation** — lifted `<AttentionPanel>` from `OverviewSection`
  to `ParentDashboard` top level, so the camera keeps running across all in-portal
  sections during a session (only resets on child switch / leaving the portal).
- **Still TODO (manual):** real-webcam pass to tune `GAZE` thresholds in `landmarks.ts`.

**Parked idea:** parent identity face-matching (NIC/selfie). Recommended NOT to build —
NIC-photo matching is unreliable, adds biometric PII + ethics burden + demo fragility;
liveness already covers "real person present." See conversation; no code written.

**NEXT — designed & approved, NOT yet built:** in-app **notifications** (quiz results /
quiz due / report card / risk alert; reading them folds into `check_frequency` → PEI, no
ML retrain) + **report cards** (admin PDF-per-term upload, parent view/download).
Full spec + 8-step build order: `2026-07-10-notifications-report-cards-design.md`.
**Execute this in a fresh session** — point at that spec.

---

## 2026-07-10 (Phase 7 — Camera, backend + frontend built)

Supervisor approval confirmed; scope **A + E** (attention verification + liveness),
no attention-quality classifier (B). Design: `2026-07-10-phase7-camera-attention-design.md`.

**Done this session (backend):**
- `POST /parent/sessions/{session_id}/attention` in `routers/parent.py` — parent must
  own the session (uses `.maybe_single()` so a bad id 404s, not 500s); validates
  `0 ≤ attentive_seconds ≤ total_seconds` and `total_seconds > 0`; computes
  `attention_score = attentive/total`, inserts an `attention_scores` row, and sets
  `monitoring_sessions.camera_enabled = true` + `liveness_passed`. **Numbers only — no
  video.** Route registration verified.
- **No engagement change needed** — `app/ml/engagement.py::_latest_attention` already
  averages real `attention_scores` and falls back to the 0.5 placeholder when none
  exist. Once attention rows land, the PEI uses the real signal automatically.
- **No schema change** — `attention_scores` + `monitoring_sessions.camera_enabled/
  liveness_passed` already existed as the socket.

**Done this session (frontend):** new dep `@mediapipe/tasks-vision@0.10.35`.
- `frontend/src/lib/attention/` — split so the novel logic is pure/testable:
  - `landmarks.ts` — pure geometry off the 478-pt `FaceLandmarker` output:
    iris-centring + head-yaw → eyes-on-screen; EAR blink + yaw-sweep →
    `LivenessDetector`. Thresholds are named constants (`GAZE`) pending a manual
    webcam tuning pass.
  - `accumulator.ts` — `AttentionAccumulator`: advances attentive/total by frame
    dt with a grace window (a blink/glance doesn't drop the count) and caps large
    frame gaps (tab hidden) so a stall can't inflate the totals.
  - `tracker.ts` — `MediaPipeAttentionTracker` (real, ~8fps, liveness→tracking,
    GPU delegate, WASM+model from the pinned MediaPipe CDN) behind an
    `AttentionTracker` interface + `MockAttentionTracker` (no camera/model, via
    `window.__ATTENTION_MOCK__`) for headless flow testing.
  - `useAttention.ts` — owns getUserMedia + hidden `<video>`, picks real/mock,
    classifies permission/no-camera/model errors into behavior-only fallbacks.
- `components/attention/AttentionPanel.tsx` — consent gate ("no video recorded or
  uploaded"; only a % + duration stored), camera-on indicator (pulsing dot) with an
  always-available Stop, live attentive/total + on-screen badge, liveness retry, and
  the post-session own-score summary. Posts once to
  `POST /parent/sessions/{id}/attention` on stop (only when liveness passed and time
  accrued); a child switch mid-run ends the run and posts to the previous session.
- Wired into the parent Overview (`pages/parent/Dashboard.tsx`), fed the active
  monitoring-session id.

**Verified:** `tsc` clean for all new files; full `vite build` succeeds and
MediaPipe lazy-splits into its own 134 kB chunk (fetched only when the tracker
inits); 11-case `tsx` fixture run over the pure logic (eyes-on-screen, liveness,
accumulator debounce/cap) all pass; app boots clean at `/login`. **Still manual:**
the authenticated mocked-flow drive (parent login + `window.__ATTENTION_MOCK__ = true`)
and the real-webcam gaze-accuracy pass — both flagged manual in the design doc.

**Pre-existing (not from this work):** `npm run build`'s `tsc -b` step reports three
recharts-v3 `Formatter` type errors in `charts/{Bars,Donut,Trend}Chart.tsx`
(untouched files). Dev and `vite build` are unaffected; worth a small tidy.

---

## 2026-07-10 (Phase 6 — Dashboards)

Built **Phase 6** — the integration + polish pass that ties the roles together.
Designed and planned first (`2026-07-10-phase6-dashboards-design.md` +
`2026-07-10-phase6-dashboards-plan.md`), then executed subagent-driven with a
spec + code-quality review after each layer. Three genuinely-new pieces; the rest
of the plan's Phase 6 checklist already existed from Phases 1–5.

### New pieces
- **Admin risk-sorted roster** — `RiskSection` (`pages/admin/Dashboard.tsx`) now
  loads a single server-sorted endpoint (`GET /admin/students/roster`) instead of
  N per-child calls; rows are keyboard-accessible and navigate to the detail page.
- **Admin student detail + intervention notes** — new page
  `pages/admin/StudentDetail.tsx` at `/admin/students/:id`: prediction + factors,
  academic records, recent activity, and a private intervention-notes log. New
  `intervention_notes` table (admin-only, RLS-enabled/no-policy — service-role API
  only, never shown to parents/children). `author_id` is taken from the
  authenticated admin, never the request body.
- **Parent engagement trend** — a Recharts line on the Parent Overview from
  `GET /engagement/{child_id}/history` (reuses the existing `TrendChart`; renders
  when ≥2 periods, else a "not enough history yet" line).

### Backend
- New router `app/routers/students.py` (roster, detail, notes) registered in
  `main.py`; history endpoint appended to `engagement.py` (reusing the existing
  parent-link authorization). A `_get_child_or_404` helper (added in review) so a
  bad/non-child id returns 404 instead of a 500 (`.maybe_single()`, not
  `.single()`).

### Review fixes applied
- Backend: unreachable 404 branch fixed; notes endpoints now reject non-child ids.
- Frontend: roster rows made keyboard-operable (`tabIndex`/`role`/`onKeyDown` +
  focus ring); note textarea given an `aria-label`; note-save failures now surface
  via `toast.error` instead of failing silently. Support-not-blame copy softened
  on the `high` band (`lib/risk.ts`).

### Verified
- Backend imports + all 41 routes register; frontend `tsc --noEmit` clean.
- **End-to-end in the browser via Playwright** (headless chromium): created
  throwaway admin + parent accounts via the service-role key, drove the real UI at
  `localhost:5173`, and confirmed all five surfaces — roster renders with
  high-risk-first ordering, student detail loads with all four cards, an
  intervention note persists across reload (with author + timestamp), roster rows
  show the focus ring on Tab, and the parent engagement trend chart plots. No
  console/page errors. All temp accounts + test rows deleted afterward; real
  accounts untouched (established cleanup habit). This pass also cleared the
  outstanding Phase 5 browser-verification gap.
- `intervention_notes` already existed on the live Supabase DB (created in a prior
  run); `schema.sql` updated to match.

---

## 2026-07-09 (Phase 5 — ML)

Built **Phase 5: the intelligence layer** — the project's one trained model plus
a transparent engagement scorer. Followed the approved design in
`2026-07-09-phase5-ml-predictor-design.md`. This is the thesis's core
contribution, so the emphasis throughout was **explainability** and honest
framing of the simulated data (association, not causation).

### ML package (`app/backend/app/ml/`)
- **`features.py`** — the frozen feature contract (9 features) shared by
  training and serving, plus per-feature labels/midpoints/protective-direction
  used to phrase explanations. Single source of truth; reordering it would
  require a retrain.
- **`data_prep.py`** — loads and *studies* the public sets (UCI Student
  Performance, xAPI-Edu-Data) to extract the involvement/attendance→performance
  relationships the simulation is grounded in (prints an evidence summary:
  xAPI parental-survey Yes→1.32 vs No→0.66 mean outcome rank; Under-7 absence
  1.44 vs Above-7 0.41). Also `recast_xapi()` maps real xAPI rows into our
  schema (features from behavioural columns only; label from `Class`) so the
  training set can union real `data_source='xapi'` rows.
- **`generate_simulated.py`** — generates a simulated Sri Lankan O/L dataset in
  our exact feature schema (latent engagement factor → correlated features →
  noisy success score → risk band), tagged `simulated_sl`, unioned with the
  xAPI recast. Reproducible (seed 42). Writes
  `datasets/generated/training_data.csv` (1680 rows: 1200 simulated + 480 xAPI).
- **`engagement.py`** — the Parental Engagement Index as a transparent weighted
  formula (NOT ML): `0.4·norm(monitoring_hours) + 0.3·norm(check_frequency) +
  0.3·parental_attention`, where attention is the neutral 0.5 placeholder until
  the Phase 7 camera. Reads `monitoring_sessions`, upserts `engagement_index`.
- **`train_predictor.py`** — trains a `RandomForestClassifier`, benchmarks it
  against LogisticRegression and GradientBoosting (reports accuracy / macro
  P-R-F1 / confusion matrix / 5-fold CV for each), keeps RF for explainability,
  and saves `models/predictor_v1.pkl` + `predictor_v1.meta.json` (feature
  order, class labels, importances, metrics, data-source mix). **RF: test
  accuracy 0.745, macro-F1 0.752, CV-F1 0.728.** Importances rank exactly as
  designed: prior grades (0.22) > quiz avg (0.16) > attendance (0.13) > parental
  monitoring (0.10) … .
- **`predictor.py`** — serving. Lazy-loads model+meta, `build_features()`
  assembles a child's vector from our tables in the frozen order (a single-row
  named DataFrame so sklearn sees the training feature names — no warning),
  `predict()` returns `{risk_band, risk_score, class_probabilities,
  top_factors, features}` where `top_factors` are the top-k importances
  annotated with the child's own value and raises/lowers-risk direction.

### API (`app/backend/app/routers/`)
- **`predictions.py`** — `GET /predictions/{child_id}` (parent-linked or admin;
  returns the latest stored row, computes+persists on demand if none) and
  `POST /predictions/run` (admin batch recompute → upserts `predictions` rows,
  returns count + model metrics). Upsert-by-hand on (child, term) since the
  table has no unique constraint.
- **`engagement.py`** — `GET /engagement/{child_id}` (parent-linked or admin);
  recomputes PEI from sessions if any exist, else returns the latest stored row
  (so demo-seeded values aren't wiped to zero).
- Both registered in `main.py`. All role checks + ML run server-side with the
  service-role key (RLS-vs-API golden rule).

### Seed + frontend
- **`app/scripts/seed_demo.py`** — idempotent demo generator. Deliberately only
  seeds the *taggable* tables (`academic_records` term=`demo-2026-t1`,
  `engagement_index` period=`demo`) across three archetypes (thriving/steady/
  at-risk) so re-runs and `--clear` are safe — student_activity/monitoring_
  sessions have no tag column, so seeding them would risk deleting real rows on
  cleanup (deviation from the plan's suggestion, made for safe idempotency).
- **Parent Overview**: a "Performance risk" card (band badge + confidence +
  explained top factors) and a "Your engagement index" card (PEI meter +
  component breakdown + the formula). Best-effort fetch — a child with no data
  shows an empty state, never blocks the page.
- **Admin**: a new "Risk Predictions" section — per-child risk roster with a
  "Run predictions" batch button and a model-health metrics card.
- `lib/types.ts` (+`RiskBand`, `Prediction`, `PredictionFactor`,
  `EngagementIndex`, `PredictionRunResult`), `lib/risk.ts` (shared band→tone/
  label metadata).

### Verified
- `python -m app.ml.train_predictor` prints the full metric suite and saves the
  model. Data + generation scripts run clean (fixed a cp1252 console-encoding
  crash on Unicode arrows — use ASCII in prints / `PYTHONUTF8=1`).
- `predictor.predict` + `_store_prediction` run end-to-end against the live
  Supabase for all child accounts, with warnings promoted to errors (none
  fired); rows land in `predictions` with attached explanations.
- Frontend `tsc --noEmit` clean.
- **Not verified in a browser this session** (non-interactive, no login
  session): the data/logic path was verified against the live DB and via
  `tsc`, but the two dashboards were not clicked through. To confirm: start
  backend + `npm run dev`, log in as admin → Risk Predictions → Run
  predictions, then as a parent open a linked child's Overview.
- **Left the demo data + predictions in place** so the app can be viewed in the
  browser; run `python -m app.scripts.seed_demo --clear` afterward to remove it
  (real Supabase project — established cleanup habit). Deps added to
  `requirements.txt`: scikit-learn, pandas, numpy, joblib.

---

## 2026-07-09

Aligned the codebase with the updated plan §3.1: the **teacher role was removed**
and all former teacher functions became admin capabilities. The user had already
edited the plan MDs to reflect this decision; this session made schema, backend,
frontend, and docs match. Full design write-up in
`2026-07-09-remove-teacher-role-admin-content.md`.

### Teacher role → Admin
- **Schema**: `user_role` enum dropped `teacher` (`'admin','parent','child'`).
  Comments updated. (Migration caveat noted in the design doc — dropping an in-use
  Postgres enum value isn't in-place; fine for a fresh setup.)
- **Backend**: `materials.py`/`subjects.py`/`quizzes.py` content guards narrowed to
  `require_role("admin")`; removed the teacher-only branches in `quizzes.py`
  (attempt-count visibility, quiz-ownership 403 — admins see all); dropped
  `"teacher"` from the role-validation sets in `admin.py`.
- **Frontend**: `UserRole` dropped `teacher`; removed teacher badge/accent/color
  tokens (`theme.ts`, `chartTheme.ts`, `index.css`); removed the `/teacher` route +
  redirect. The teacher content UI moved into a new `pages/admin/ContentManager.tsx`
  (no `PortalLayout`, `section` as a prop), and the **Admin sidebar now reads
  Users · Parent↔Child Links · Materials · Quizzes** — chose flat sidebar entries
  over a nested "Content" tab (user asked for the recommendation). Deleted
  `pages/teacher/Dashboard.tsx`.
- **Docs**: `README.md` role list / first-run / Phase 1–2 notes updated.
- Verified: `tsc --noEmit` clean.

### Dark-mode dropdown fix (same day)
User screenshot showed a native `<select>` popup rendering white in dark mode on the
Materials subject picker. Root cause: a native select's dropdown follows the
element's `color-scheme`, not Tailwind `bg-*` classes, and `ui/Field.tsx`'s `Select`
set neither. Fixed on the shared component (`bg-white dark:bg-slate-900
dark:[color-scheme:dark]`), so every dropdown app-wide now themes correctly.

### State after this session
No teacher role anywhere in code; admin owns content management via the Materials
and Quizzes sidebar sections. Frontend typechecks clean. Not yet done: re-running
the enum change against an existing seeded DB (if any), and an in-browser
confirmation of the dark dropdown. Other plan docs (`Implementation_Plan_Updated.md`,
the 2026-07-08 design doc) still reference a teacher role and weren't swept.

---

## 2026-07-08

Continuation of the UI work from the previous session. User shared a live
screenshot of their own browser at `/admin` (confirmed they run the app
themselves alongside these sessions — not just something verified in
automation) and asked for two things: (1) restyle the Login page as a
creative split-panel card over a hero photo, warm brown palette, and (2)
rework the dashboards to match that palette, with a more attractive sidebar,
folding the top navbar's user info into the sidebar, animations, and
tables with edit/delete actions plus filterable/animated cards. Asked
clarifying questions before each (reveal style + palette for the login;
delete semantics + rollout scope for the dashboards) — user picked the
recommended option every time.

### Login page
Rebuilt to match a reference the user pasted (CodePen-style split-panel
modal): warm `#8c7569`/`#55311c` palette, Nunito font (Google Fonts link in
`index.html`), hero background photo + a second photo in the card's right
panel (reused the user's own reference URLs, not invented ones), entrance
animation on mount rather than gated behind a "click to reveal" button
(chose immediate reveal since forcing a click before typing credentials is
needless friction on an actual login page, unlike the marketing-site
pattern the reference came from).

### Dashboard rework (Admin done; Teacher/Parent/Child intentionally not
touched yet — user chose "Admin first, then extend")
- **Color system**: `frontend/src/lib/theme.ts` replaced the old per-role
  indigo/blue/emerald/violet accent scheme with a single `BRAND` warm-brown
  palette matching the Login page. `Button` and `Field`/`Input`/`Select`
  updated to the same palette. Role badges (the small colored pills) still
  use distinct tones per role for scannability — that's a different concern
  from the page's overall brand color.
- **Layout**: `PortalLayout` reworked — the sidebar now carries the user's
  avatar/name/role badge and the sign-out button at its bottom (folded in
  from the old separate top header), and the desktop top bar was dropped
  entirely; the page title renders inline in the main content area instead.
  Mobile keeps a minimal top strip (hamburger + brand name) since the
  sidebar itself is hidden there. Nav items, the page content, and stat
  cards all get subtle staggered entrance animations (new keyframes in
  `index.css`: `nav-in`, `page-in`, `card-in`, `row-in`).
- **New backend capability** (didn't exist before): `PATCH /admin/users/{id}`
  (edit name/role/grade — uses `exclude_unset` rather than filtering `None`,
  so grade_level can be explicitly cleared when a child's role changes),
  `DELETE /admin/users/{id}` (permanent — cascades quiz_attempts,
  student_activity, monitoring_sessions, parent_child_link, and the user's
  own quizzes/materials — including their storage objects — before deleting
  the auth user, since none of those foreign keys cascade on their own),
  `DELETE /admin/links/{id}` (unlink). Added `apiPatch`/`apiDelete` to
  `lib/api.ts` and a reusable `ConfirmDialog` component for destructive
  actions.
- **Admin Users table**: hover-revealed Edit (pencil) and Delete (trash)
  icons per row, a search box (name/email), and the four role-count stat
  cards are now clickable filters (click again to clear) with a hover-lift
  and an active-state ring.
- **Admin Links table**: hover-revealed unlink icon per row.
- Verified with a throwaway Playwright script again (login → filter cards →
  search → edit modal → delete confirm → mobile + drawer), zero console
  errors; test admin account deleted afterward via the cleanup script: real
  accounts confirmed untouched.

### State after this session
Login page and Admin dashboard done in the new brand style with edit/delete/
filter. Teacher/Parent/Child dashboards still visually inherit the new
sidebar/color automatically (shared `PortalLayout`/`theme.ts`/`Button`), but
have not yet gotten the same table-actions/filter/card treatment — that's
the next piece once the user reviews Admin.

---

## 2026-07-07

Picked up from a prior session that had finished Phase 0 (project setup) and
Phase 1 (auth & roles, admin console). Built Phases 2–4 of
`Implementation_Plan_Updated.md` end to end (schema → backend → frontend),
verifying after each phase with `tsc --noEmit` on the frontend and a Python
import/route-registration check on the backend.

### Phase 2 — Teacher Content Tools
- `supabase/schema.sql`: added the `materials` Storage bucket (created via
  SQL, `public = false`) and Phase 2 RLS select policies (`subjects`,
  `learning_materials`, `quizzes`, `quiz_questions` readable by any
  authenticated user — writes still go through the API with the
  service-role key).
- Backend: new `subjects.py`, `materials.py`, `quizzes.py` routers.
  Material upload streams the file into Supabase Storage and inserts a
  `learning_materials` row; downloads return a signed URL. Quiz creation
  accepts a title + nested question list (MCQ or short-answer) in one
  request. Added the `python-multipart` dependency (required by FastAPI for
  `UploadFile`/`Form` parsing) and installed it into `.venv`.
- Frontend: rebuilt the Teacher Dashboard — subject picker/creator, material
  upload form + list with download, and a quiz builder with dynamic
  add/remove questions and MCQ options.

### Phase 3 — Child Learning + Activity Tracking
- Backend: new `activity.py` router (`POST /activity`, `GET /activity/me`)
  writing to `student_activity`. Extended `quizzes.py` so `GET /quizzes/{id}`
  strips `correct_answer` when the caller's role is `child` (the answer key
  must never reach the student), and added `POST /quizzes/{id}/attempts`
  (auto-grades MCQ questions, stores the attempt, logs a `quiz_submit`
  activity row) plus `GET /quizzes/attempts/me`.
- Frontend: rebuilt the Child ("My Learning") dashboard — subject browser,
  material list with an inline `<video>` player that logs watch-percent on
  pause/end, a quiz-taking flow with immediate auto-graded scoring, and a
  progress section (recent activity + quiz scores). No risk prediction is
  ever shown to the child, per the plan's explicit design suggestion.

### Phase 4 — Parent Monitoring (behavioral only)
- Backend: new `parent.py` router. `GET /parent/children` lists linked kids
  via `parent_child_link`; `GET /parent/children/{id}/activity` and
  `/quiz-attempts` check the parent is actually linked to that child before
  returning anything (403 otherwise — this is the one place a bug would leak
  another family's data). Monitoring-session lifecycle:
  `POST /parent/sessions` (start), `POST /parent/sessions/{id}/ping`
  (increments `pages_viewed` or `history_checks`), `POST
  /parent/sessions/{id}/end`, `GET /parent/sessions` (the parent's own
  session history).
- Frontend: rebuilt the Parent Portal — child selector, Overview / Activity
  History / Quiz Scores tabs. Selecting a child opens a monitoring session;
  switching tabs or children pings/ends it. A "Your monitoring sessions"
  table shows the resulting duration/pages-viewed/history-checks data,
  satisfying Phase 4's exit criteria (monitoring produces real session +
  behavioral data). `attention_scores` is still untouched — that stays empty
  until Phase 7.

### State after this session
Phases 0–4 done. `README.md`'s "Current status" section was updated to
match. Next up: **Phase 5 (ML: engagement scorer + performance predictor)**
— the first phase that needs the datasets already sitting in
`client01/datasets/` — then Phase 6 (dashboards) and the still-deferred
Phase 7 (camera, pending supervisor approval).

### UI/UX redesign (same day, after Phase 4)
Reworked the whole frontend into a "modern SaaS dashboard" look, per-role
(indigo/blue/emerald/violet for admin/teacher/parent/child). Added
`lucide-react` (icons) and `@headlessui/react` (accessible Dialog/RadioGroup).

- New shared design system in `frontend/src/components/ui/`: `Button`,
  `Card`, `Modal`, `Badge`, `EmptyState`, `Spinner`/`LoadingScreen`, `Alert`,
  `Avatar`, plus `Field`/`Input`/`Select` in place of the old copy-pasted
  `inputClass` string in every page. `lib/theme.ts` holds the per-role accent
  classes — Tailwind only picks up class names it can see as literal
  strings, so these are spelled out in full rather than built with
  `` `bg-${accent}-600` `` template interpolation.
- `PortalLayout` rewritten as a responsive sidebar shell (persistent on
  desktop, a Headless UI Dialog drawer on mobile) driven by a `navItems`
  list per role — this replaced the old top-bar-only layout and the ad-hoc
  tab bar Parent had. Each dashboard's create/upload/link forms moved from
  always-visible inline cards into `Modal`s opened by an action button.
  Added a `ToastContext` (bottom-right, auto-dismiss) for success/error
  feedback instead of silent refreshes.
- Verified for real: started both dev servers, drove the app with a
  throwaway Playwright script (`playwright` was a temp devDependency, since
  removed) through all four roles — create accounts, link parent/child,
  create a subject + quiz, take the quiz as the child, view it as the
  parent. All test accounts/subjects/quizzes created during this were
  deleted afterward; the real accounts (`saara.kaizer@gmail.com`,
  `teacher1`/`parent1`/`student1`) were untouched.
- **Found and fixed a real backend bug while verifying**, unrelated to the
  UI: `app/auth/dependencies.py`'s `_decode_token` called `jwt.decode(...)`
  with the PyJWT default `leeway=0`, so a token whose `iat` (stamped by
  Supabase's server clock) landed even a fraction of a second ahead of this
  machine's clock got rejected as "not yet valid" — a real 401 users could
  hit right after login. Fixed with `leeway=10`.
- Known rough edge, not fixed: under fast/automated interaction (and this
  sandbox's occasional network jitter to Supabase) a dashboard's
  post-mount fetch can occasionally resolve *after* a later user-triggered
  fetch and clobber it with stale (e.g. "0 attempts") state — there's no
  request sequencing/cancellation in the `apiGet`-in-`useEffect` pattern
  used throughout (pre-existing pattern, not introduced this session).
  Confirmed via direct API/DB checks that the underlying data is always
  correct; a manual refresh always shows it. Worth an `AbortController` or
  a request-id guard if it ever shows up in real usage.

### Login page restyle (same day, after the redesign)
User pasted a reference CodePen-style split-panel login modal (Nunito font,
warm brown palette `#8c7569`/`#55311c`, hero photo background, left = form /
right = photo) and asked for "similar to this, like creative." Asked two
quick questions first: show the card immediately with an entrance animation
vs. gate it behind the reference's "click to reveal" pill (chose immediate),
and keep the reference's warm palette vs. the app's indigo brand (chose the
reference's palette — login/auth screens are commonly styled distinctly from
the internal app chrome). `Login.tsx` rewritten accordingly; Nunito loaded
via a Google Fonts `<link>` in `index.html`; two entrance keyframes
(`login-card-in`, `login-panel-in`) added to `index.css`. Reused the exact
two Unsplash URLs from the user's own reference snippet (background + right
panel) rather than inventing new ones. Verified with a throwaway Playwright
screenshot at desktop and mobile widths — the background/panel photos take
a couple seconds to paint in a fresh headless load (confirmed via response
listener that both return 200; not an app bug), which real users on a normal
connection won't notice.
