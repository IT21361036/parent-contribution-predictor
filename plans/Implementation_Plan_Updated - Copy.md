# Implementation Plan (Updated)
## AI-Driven LMS with Parental Monitoring — Phase-by-Phase Build

This is the current, correct implementation plan reflecting the redesigned scope: a full role-based Learning Management System with three roles — **admin, parent, and student (child)** — studying how parental monitoring relates to O/L student performance in Sri Lanka. There is no separate teacher role: **all teaching/content functions live inside the admin panel** (e.g. a content-management area in the admin sidebar). The parental **camera component — parent attention verification (A)** — is deferred until the client and supervisor confirm the approach, so Phases 0–6 are built now, and Phase 7 (camera) drops in later with no rework.

**The finalized camera direction:** the camera verifies that the parent is genuinely *looking at the screen* while monitoring their child — measuring not just how long they spend (timer + scroll tracking) but whether they are actually paying attention during that time. This parent-side attention verification is the novel contribution.

**8 phases total: Phase 0 → Phase 7.**

- **Phases 0–6** — build now (full working LMS, predictor, dashboards). No dataset needed until Phase 5.
- **Phase 7** — camera component, added after supervisor approval.

> **The principle that makes deferring safe:** the database schema already includes the `attention_scores` table and a `camera_enabled` flag. The camera's "socket" exists now; the "plug" arrives after approval. No schema change, no rework when it lands.

---

## Do I need a dataset?

**Only one, only for the predictor (Phase 5), and only the simulated + public combo you already chose.** Everything in Phases 0–4 runs on data your own users generate as they use the app — no dataset required to build or demo the LMS. The performance predictor is the single component that must be *trained* on historical examples, so that's the one place a dataset is needed.

---

## Phase 0 — Project Setup
**Duration:** Week 1
**Goal:** Get the workshop ready before building anything.

**Tasks**
- [ ] Create the Supabase project (database + auth + storage).
- [ ] Set up the Git repository with folder structure:
  ```
  /frontend      # React + TypeScript
  /backend       # FastAPI
  /ml            # training scripts, model files
  /docs          # this plan, schema, design docs
  ```
- [ ] Create Supabase Storage buckets: `materials` (documents/exams), `models` (trained .pkl later).
- [ ] Decide the video host (Supabase Storage for prototype; Cloudflare Stream / Mux for production).
- [ ] Local dev environment: Python 3.11+, Node 18+, Docker.
- [ ] CI stub (lint + basic test on every push).

**Exit criteria:** Everyone can run the app skeleton locally and it connects to Supabase.

---

## Phase 1 — Auth & Roles
**Duration:** Weeks 1–2
**Goal:** The login system and role structure — the backbone of a role-based app.

**Tasks**
- [ ] Supabase Auth signup/login.
- [ ] `profiles` table tagging each user: admin / parent / child (student). No teacher role — content management is an admin capability.
- [ ] Parent↔child linking screen (admin connects a parent to their child).
- [ ] Enable Row-Level Security (RLS) on all tables and write the core policies — especially: a parent can only read rows where `child_id` is linked to them.
- [ ] Role-based routing so each role lands on the correct portal.

**Exit criteria:** A parent logging in sees only their linked child; each role routes to the right portal.

---

## Phase 2 — Admin Content Tools
**Duration:** Weeks 2–4
**Goal:** Give the admin the ability to add and manage content. These are the former "teacher" features, now part of the admin panel — surfaced as a content-management section in the admin sidebar.

**Tasks**
- [ ] Upload documents / exam papers to Supabase Storage; store only the reference path in `learning_materials`. Serve downloads via signed URLs.
- [ ] Upload videos to the chosen video host; store the reference.
- [ ] Quiz builder: MCQ (auto-graded) + short answer (manual/flagged).
- [ ] Organise content by subject and grade (O/L subjects).

**Exit criteria:** An admin can populate a subject with materials, a video, and a quiz from the admin panel.

---

## Phase 3 — Child Learning + Activity Tracking
**Duration:** Weeks 4–6
**Goal:** The student side — and the part that starts generating your data.

**Tasks**
- [ ] Subject browser; material/video viewer; quiz taker; exam downloads.
- [ ] Track time-on-material, video watch-percentage, quiz attempts and scores into `student_activity`.
- [ ] Child sees their own progress — but NOT their own risk prediction (see suggestions).

**Exit criteria:** A child using the app produces real activity data in the database.

---

## Phase 4 — Parent Monitoring (behavioral only)
**Duration:** Weeks 6–7
**Goal:** The parent side, without the camera.

**Tasks**
- [ ] Parent views child's activity, history, and progress.
- [ ] Monitoring sessions log parent behavior: check frequency, session duration, pages/history viewed.
- [ ] `attention_scores` table exists but stays empty — it's the camera's slot for Phase 7.

**Exit criteria:** Parent monitoring produces session + behavioral data.

---

## Phase 5 — ML: Engagement Scorer + Performance Predictor
**Duration:** Weeks 7–9
**Goal:** Make the app intelligent. **This is the one phase that needs a dataset.**

**Tasks**
- [ ] Prepare the dataset: public datasets (xAPI-Edu-Data, UCI Student Performance) + a simulated Sri Lankan O/L dataset grounded in their statistical relationships. Tag every simulated row with a `data_source` field.
- [ ] Engagement scorer: a weighted formula combining monitoring hours, check frequency, and attention (uses a neutral placeholder for the attention value until the camera lands).
- [ ] Train the performance predictor offline (scikit-learn — Random Forest, Logistic Regression, etc.); compare with the metrics in the proposal (accuracy, precision, recall, F1).
- [ ] Save the winning model as a versioned `.pkl`; load it in FastAPI; expose predictions with top-factor explanations.

**Exit criteria:** Predictions (with explanations) appear in the parent and admin dashboards.

---

## Phase 6 — Dashboards
**Duration:** Weeks 9–11
**Goal:** The role-specific views that tie everything together.

**Tasks**
- [ ] Admin dashboard: content management (the former teacher tools), class roster sorted by risk band, student detail, intervention notes, system-wide analytics, user management, parent-child linking, and model health — organised via the admin sidebar.
- [ ] Parent dashboard: child overview, activity history, prediction + contributing factors, own engagement trend.
- [ ] Student (child) view: own progress and encouraging feedback — but NOT their own risk prediction.
- [ ] Apply design principles: support-not-blame language, mobile-first parent view, explainable predictions.

**Exit criteria:** All three roles (admin, parent, student) have a usable dashboard.

---

## Phase 7 — Camera Component: Parent Attention Verification (DEFERRED — awaiting client + supervisor confirmation)
**Duration:** After approval
**Goal:** Add the parental attention-verification component once confirmed.

### What this component does (finalized direction)
The camera verifies that the parent is **genuinely looking at the screen** while monitoring their child's progress — not just leaving the page open. It works alongside the monitoring session's activity tracking:

- **Timer + scroll tracking** measures the *quantity* — how long the parent spends monitoring and moving through the child's materials/history.
- **Camera attention verification** measures the *genuineness* — whether the parent is actually looking at the screen during that time.
- Combined result per session: e.g. *"parent spent 15 minutes monitoring and was genuinely attentive for 12 of them."*

The camera is what stops the timer from being fooled by a parent who leaves the page open and walks away.

### Two questions being confirmed with the client first
1. Does "eye contact from the parent's side" mean the camera checks the parent is **actually looking at the screen** while monitoring?
2. Is the goal to confirm the parent is **paying attention** (eyes on screen), or just **physically present**?

Once the client confirms these, this phase is unblocked.

### Component layers
- **Core (A) — Attention verification:** camera + timer measure how long the parent stays attentive during a monitoring session. *This is the main, novel component (parent-side attention, not student-side).*
- **Recommended safeguard (E) — Liveness check:** a light-touch check that a real live person is present (not a photo or looped video), so the attention data can't be faked. Secondary to A, but protects A's validity.
- **Optional extension (B) — Attention quality:** richer signals (focus, gaze consistency) as an extra research feature, added only if time allows. Not required for the core contribution.

**Tasks**
- [ ] Confirm the two questions above with the client.
- [ ] Build the attention verification (A) in the browser using MediaPipe Face Mesh + Iris — detect eyes-on-screen, accumulate attentive time against the session timer.
- [ ] Add the liveness safeguard (E) at session start.
- [ ] (Optional) Extract attention-quality features (B) if scope allows.
- [ ] POST the computed attention score/duration to the existing `/monitoring/session/{id}/attention` endpoint.
- [ ] Swap the placeholder attention value in the engagement scorer for the real score. **No schema change.**
- [ ] Camera-specific ethics safeguards: consent gate, **no raw video/frames stored (score/duration only)**, clear camera-active indicator, parent can see their own attention score.

**Exit criteria:** Genuine, verified parental attention data (time + attention) flows into the engagement index; the loop is complete.

---

## Summary Timeline

| Phase | Focus | Window | Dataset needed? |
|---|---|---|---|
| 0 | Project setup | Week 1 | No |
| 1 | Auth & roles | Weeks 1–2 | No |
| 2 | Admin content tools | Weeks 2–4 | No |
| 3 | Child learning + activity tracking | Weeks 4–6 | No |
| 4 | Parent monitoring (behavioral) | Weeks 6–7 | No |
| 5 | ML: engagement + predictor | Weeks 7–9 | **Yes (simulated + public)** |
| 6 | Dashboards | Weeks 9–11 | No |
| 7 | Camera: parent attention verification | After approval | No |

**Build now:** Phases 0–6 (the full working LMS). **Drop in later:** Phase 7 (camera), with zero rework.

---

## Key Suggestions Carried Forward

- **Don't show the child their own risk score** — only admin and parent see predictions; the child sees encouraging progress. A "high risk of failure" label can be self-fulfilling for a teenager.
- **Time-on-material is gameable** — a child can open a PDF and walk away. Consider lightweight integrity signals (scroll depth, tab-focus) so activity data isn't trivially inflated.
- **Frame monitoring as association, not causation** — "more monitoring is associated with better results," not a guarantee, in both the thesis and the UI.
- **Build a seed/demo data tool early** — since Phase 5 uses simulated data, a one-click demo-data generator makes every later phase and client demo easier.
- **Log an audit trail from day one** — who viewed which child's data and when. Cheap now, invaluable for the ethics review.
