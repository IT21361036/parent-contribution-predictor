# End-to-End Build Plan
## AI-Driven LMS with Parental Monitoring & Attention Verification

A complete, buildable plan you can start on today. Covers architecture, the model strategy (what to train vs. what to reuse), Supabase database schema, role-based features, FastAPI backend structure, and the camera component — designed so you can build the whole application **while the camera A+B+E specifics are still being finalised with the supervisor**.

---

## 0. The Big Question First: How Many Models Do You Actually Train?

**Short answer: you train exactly ONE model — the parent attention/camera model. Everything else is either a pre-trained model you call, or a rule-based calculation.**

Here is the honest breakdown, because this saves you enormous time:

| Component | Is it a "trained model"? | What you actually do |
|---|---|---|
| **Camera: liveness (E)** | No — use a library | Use a pre-trained face/liveness detector (MediaPipe, or a liveness lib). No training. |
| **Camera: gaze/attention (A)** | No — use a pre-trained model | Use **MediaPipe Face Mesh + Iris** to get eye/gaze landmarks, then write **your own logic** on top to decide "looking at screen / not". No training needed. |
| **Camera: attention-quality features (B)** | **This is the one place you might train** | You *can* train a small classifier on the gaze features (focused vs. distracted). This is your genuine ML contribution. Optional: even this can start rule-based. |
| **Model 3: Parental Engagement Scorer** | No — rule-based (then optional regression) | A weighted formula combining monitoring hours + check frequency + attention score. Start as math, not ML. |
| **Model 1: Performance Predictor** | **Yes — but classic ML, not deep learning** | Train scikit-learn models (Random Forest etc.) on your tabular data. This is standard, fast, well-understood. |

So realistically:
- **1 classic ML model** (performance predictor — Random Forest & friends, scikit-learn)
- **1 pre-trained model reused** (MediaPipe for gaze — you write logic, not training)
- **1 optional small trained model** (attention-quality classifier — your novelty, but can start rule-based)
- **1 rule-based scorer** (engagement index — just a formula)

**Do you need Hugging Face?** → **No, not for the core project.** Here's why:

- Gaze/eye tracking is a **computer-vision landmark** problem, and MediaPipe solves it better and lighter than anything on Hugging Face. It runs in the browser, no GPU, no model download headaches.
- The performance predictor is **tabular data** → scikit-learn is the right tool, not transformers.
- Hugging Face shines for NLP/LLMs/large vision transformers — none of which your core pipeline needs.

**When Hugging Face *would* make sense (optional future features):**
- If you add a chatbot/study assistant for students → then yes, an LLM via Hugging Face or an API.
- If you want to auto-generate quiz questions from uploaded materials → an NLP model.
- If you replace MediaPipe with a heavier gaze transformer for research rigor (probably overkill).

**Recommendation: skip Hugging Face for v1. MediaPipe + scikit-learn + FastAPI + Supabase is the whole stack.**

---

## 1. Full Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Database + Auth + Storage | **Supabase** (PostgreSQL + Auth + Storage + RLS) | One tool gives you DB, user auth with roles, file storage for materials/videos, and row-level security. Perfect for a role-based app. |
| Backend API | **FastAPI** (Python) | Pairs with the Python ML code; async; auto API docs. |
| ML (predictor + engagement) | **scikit-learn, pandas, XGBoost** | Classic tabular ML. |
| Camera / gaze | **MediaPipe Face Mesh + Iris** (JS in-browser) | Runs on the parent's device; no video leaves their machine. |
| Frontend | **React + TypeScript** (+ Tailwind) | Role-based dashboards; `getUserMedia` for webcam. |
| Video hosting | Supabase Storage (small scale) or a CDN/YouTube-unlisted (larger) | Admin-uploaded videos. |
| Deployment | Docker + a cloud VM, or Vercel (frontend) + Railway/Render (API) | Simple prototype hosting. |

**Why Supabase is a great fit for a role-based app specifically:** it has built-in authentication with a `role` concept, and **Row-Level Security (RLS)** policies that enforce "a parent can only read their own child's rows" *at the database level* — not just in your app code. That's a big security win for a project handling minors' data.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (React + TS)                                        │
│  Student portal │ Parent portal │ Admin portal              │
│  + Webcam capture (MediaPipe runs HERE, in-browser)          │
└───────────────┬─────────────────────────────────────────────┘
                │ REST (JWT from Supabase Auth)
┌───────────────▼─────────────────────────────────────────────┐
│  BACKEND (FastAPI)                                            │
│  - Auth middleware (verify Supabase JWT + role)              │
│  - LMS endpoints (materials, quizzes, activity)              │
│  - Monitoring endpoints (sessions, attention scores)         │
│  - ML endpoints (engagement score, performance prediction)   │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
┌───────▼──────────┐          ┌─────────▼──────────┐
│  SUPABASE        │          │  ML LAYER          │
│  - PostgreSQL    │          │  - scikit-learn    │
│  - Auth (roles)  │          │    (predictor)     │
│  - Storage       │          │  - engagement calc │
│  - RLS policies  │          │  - loads .pkl model│
└──────────────────┘          └────────────────────┘
```

Key point: **MediaPipe runs in the browser**, so raw webcam frames never touch your server. The browser computes gaze → sends only the numeric attention score to FastAPI → FastAPI stores the score in Supabase. This is the privacy backbone.

---

## 3. Role-Based Feature Breakdown

Think of the app as three products sharing one backend. Here's each role thought through from its own perspective.

### 3.1 Admin
The content creator, overseer, and system manager. There is no separate teacher role — all content/teaching functions are admin capabilities, surfaced through a content-management area in the admin sidebar.

**Content features (the former teacher tools, now in the admin panel):**
- Upload learning materials (PDFs, docs, slides)
- Upload videos (lessons)
- Create quizzes (MCQ, short answer) with auto-grading for MCQs
- Upload exam papers for download
- Organise content by subject & grade (O/L subjects)
- View class roster with each student's activity + risk band
- See which students are at-risk (from the predictor) and why
- Message parents

**Management features:**
- Manage all users (create/deactivate admin, parent, student accounts)
- Link parents to children
- View system-wide analytics (engagement trends, model health)
- Manage subjects/classes

### 3.2 Student (Child)
The learner. Everything they do generates the academic-behavior data.

**Features:**
- Browse materials & videos by subject
- Watch videos (watch-time tracked)
- Read materials (time-on-material tracked)
- Take quizzes (scores recorded)
- Download exam papers
- See their own progress (own quiz scores, completion) — *not* their risk prediction (that's for admin/parent, to avoid discouraging the child)
- View assigned work

**Data captured silently:** time-on-material, video watch %, quiz attempts & scores, download events, login frequency. This feeds Model 1.

### 3.3 Parent
The research core. Monitors the child + is measured by the camera.

**Features:**
- Link to their child (set by admin)
- Start a **monitoring session** (camera consent → webcam on)
- View child's materials, what they've studied, time spent
- View child's quiz scores & progress history
- View child's predicted performance & risk band + suggested actions
- See **their own engagement trend** ("you monitored 4 hrs this week, attention 82%")
- Receive alerts when child is flagged at-risk
- Message the admin

**Data captured during monitoring:** session duration, pages/history viewed, check frequency, **+ attention score from camera**. This feeds Model 3.

---

## 4. Supabase Database Schema

Full schema below. Written as PostgreSQL DDL you can paste into the Supabase SQL editor. Includes RLS notes.

```sql
-- ========== USERS & ROLES ==========
-- Supabase Auth handles the auth.users table automatically.
-- We add a profiles table linked to it for role + details.

create type user_role as enum ('admin', 'parent', 'child');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  email text unique,
  grade_level text,            -- for children (e.g. 'O/L', 'Grade 11')
  created_at timestamptz default now()
);

-- ========== PARENT ↔ CHILD LINK ==========
create table parent_child_link (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references profiles(id) on delete cascade,
  child_id  uuid not null references profiles(id) on delete cascade,
  relationship text,           -- 'mother','father','guardian'
  created_at timestamptz default now(),
  unique (parent_id, child_id)
);

-- ========== SUBJECTS ==========
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,          -- 'Mathematics','Science','English','Sinhala'...
  grade_level text,
  created_at timestamptz default now()
);

-- ========== LEARNING MATERIALS (docs, videos, exams) ==========
create type material_type as enum ('document','video','exam_paper','slide');

create table learning_materials (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references profiles(id),  -- admin
  subject_id uuid references subjects(id),
  title text not null,
  description text,
  type material_type not null,
  storage_path text not null,   -- path in Supabase Storage bucket
  duration_seconds int,         -- for videos
  created_at timestamptz default now()
);

-- ========== QUIZZES ==========
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),   -- admin
  subject_id uuid references subjects(id),
  title text not null,
  total_marks int,
  created_at timestamptz default now()
);

create type question_type as enum ('mcq','short_answer');

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  question_text text not null,
  type question_type not null,
  options jsonb,                -- for MCQ: ["A","B","C","D"]
  correct_answer text,          -- for auto-grading MCQs
  marks int default 1
);

create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id),
  child_id uuid not null references profiles(id),
  score numeric,
  max_score numeric,
  answers jsonb,
  submitted_at timestamptz default now()
);

-- ========== STUDENT ACTIVITY (feeds Model 1) ==========
create type activity_action as enum ('view','download','video_watch','quiz_start','quiz_submit');

create table student_activity (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  material_id uuid references learning_materials(id),
  action activity_action not null,
  time_spent_seconds int,       -- time on material / watch time
  watch_percent numeric,        -- for videos (0-100)
  created_at timestamptz default now()
);

-- ========== MONITORING SESSIONS (parent behavior) ==========
create table monitoring_sessions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references profiles(id),
  child_id uuid not null references profiles(id),
  started_at timestamptz default now(),
  ended_at timestamptz,
  pages_viewed int default 0,
  history_checks int default 0,
  camera_enabled boolean default false,
  liveness_passed boolean         -- Option E result
);

-- ========== ATTENTION SCORES (camera output — NO video/frames) ==========
create table attention_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references monitoring_sessions(id) on delete cascade,
  attention_score numeric,        -- 0..1 (Option A)
  attentive_seconds int,
  total_seconds int,
  gaze_consistency numeric,       -- Option B feature
  focus_quality numeric,          -- Option B feature
  computed_at timestamptz default now()
);

-- ========== ENGAGEMENT INDEX (Model 3 output) ==========
create table engagement_index (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  period text,                    -- 'week-2026-01' or term id
  monitoring_hours numeric,
  check_frequency numeric,
  avg_attention_score numeric,
  engagement_index numeric,       -- the composite score
  computed_at timestamptz default now()
);

-- ========== ACADEMIC RECORDS ==========
create table academic_records (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  subject_id uuid references subjects(id),
  term text,
  assessment_score numeric,
  exam_score numeric,
  attendance_pct numeric,
  created_at timestamptz default now()
);

-- ========== PREDICTIONS (Model 1 output) ==========
create table predictions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  term text,
  model_version text,
  risk_band text,                 -- 'low','medium','high'
  risk_score numeric,
  top_factors jsonb,              -- explainability
  generated_at timestamptz default now()
);

-- ========== MESSAGES ==========
create table messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);
```

### 4.1 Row-Level Security (the key Supabase advantage)

Enable RLS on every table, then add policies. Examples of the *intent* (write these as Supabase policies):

- **Child (student)** can read materials/quizzes; can only read/write their *own* `student_activity`, `quiz_attempts`.
- **Parent** can only read rows where the `child_id` is linked to them via `parent_child_link`. This one policy is what enforces "a parent never sees another family's child."
- **Admin** can do everything — read activity/predictions for all students, and write materials & quizzes (the former teacher permissions are now part of admin).

This means even if your frontend has a bug, the database itself refuses to hand a parent another child's data.

---

## 5. FastAPI Backend Structure

```
/backend
  /app
    main.py                 # FastAPI app entry
    config.py               # env vars (Supabase URL/keys)
    /auth
      dependencies.py       # verify Supabase JWT, extract role
    /routers
      materials.py          # admin upload, list, get
      quizzes.py            # create, attempt, auto-grade
      activity.py           # log & fetch student activity
      monitoring.py         # start/end session, submit attention score
      engagement.py         # compute & fetch engagement index (Model 3)
      predictions.py        # run & fetch predictions (Model 1)
      messages.py
    /ml
      predictor.py          # loads random_forest.pkl, predicts
      engagement.py         # engagement index formula (Model 3)
      train_predictor.py    # offline training script
    /db
      supabase_client.py    # supabase-py client
  requirements.txt
  Dockerfile
```

### 5.1 How FastAPI works with Supabase (the pattern)

1. Frontend logs in via **Supabase Auth** → gets a JWT.
2. Frontend calls FastAPI with `Authorization: Bearer <JWT>`.
3. FastAPI **verifies the JWT** (Supabase gives you the secret) and reads the user's `role`.
4. FastAPI does business logic + ML, and talks to Supabase (Postgres) for data.

You get to choose: simple CRUD can go **frontend → Supabase directly** (using RLS for safety), while anything involving **ML or complex logic goes frontend → FastAPI → Supabase**. A good rule: reads/writes of plain data can hit Supabase directly; predictions, engagement scoring, and quiz auto-grading go through FastAPI.

### 5.2 Key endpoints

| Endpoint | Method | Role | Purpose |
|---|---|---|---|
| `/materials` | POST | admin | Upload material metadata (file goes to Supabase Storage) |
| `/materials` | GET | all | List materials by subject |
| `/quizzes/{id}/attempt` | POST | child | Submit quiz, auto-grade MCQs |
| `/activity` | POST | child | Log a view/watch/download event |
| `/monitoring/session/start` | POST | parent | Start session, record liveness (E) result |
| `/monitoring/session/{id}/attention` | POST | parent | Submit computed attention score (A/B) |
| `/monitoring/session/{id}/end` | POST | parent | Close session |
| `/engagement/{child_id}` | GET | parent/admin | Get engagement index (Model 3) |
| `/predictions/{child_id}` | GET | parent/admin | Get performance prediction (Model 1) |
| `/predictions/run` | POST | admin | Batch re-run predictions |

---

## 6. The Camera Component (A + B + E) — Where It Runs

Confirmed direction: **A + B + E, combined as three layers of one flow, all inside the browser using MediaPipe.**

```
Session start
   │
   ├─ [E] Liveness check ──── real live person? ── no ──> block session
   │                                              yes
   ├─ [A] Every frame: MediaPipe Face Mesh + Iris
   │        → is gaze on screen? → accumulate attentive time
   │
   ├─ [B] Derive quality features: gaze consistency, focus stability
   │
   └─ Session end → compute: attention_score, gaze_consistency, focus_quality
            │
            └─> POST to FastAPI → store in attention_scores (NUMBERS ONLY)
```

**Critical:** MediaPipe runs client-side (JS). The webcam stream and frames **never leave the browser**. Only the final numbers are sent to your API. This is both the privacy guarantee and, conveniently, far less server load.

**What you build here (not train):**
- E: liveness check (blink detection / motion — MediaPipe landmarks make this doable with logic, or a small liveness lib).
- A: your logic mapping iris/eye landmarks → "on screen or not" → attentive-time accumulator.
- B: your logic computing consistency/quality from the gaze stream. *(Optional: later train a small classifier on these features — this is your one genuine research-model opportunity.)*

---

## 7. Build Order (so you can start now)

Build the LMS foundation first — it doesn't depend on the camera decision at all.

1. **Supabase setup** — create project, run the schema (Section 4), enable RLS, create Storage buckets (`materials`, `videos`).
2. **Auth + roles** — signup/login, profiles table, role assignment, parent-child linking (admin).
3. **Admin content features** — upload materials/videos/exams, create quizzes (the former teacher tools, now in the admin panel).
4. **Student (child) features** — browse, watch (track watch-time), take quizzes (auto-grade), download.
5. **Activity tracking** — log everything the child does into `student_activity`.
6. **Parent features (no camera yet)** — link, view child activity/history, monitoring sessions logging behavior only.
7. **Engagement scorer (Model 3)** — the formula, computed from monitoring + activity data.
8. **Performance predictor (Model 1)** — train on your simulated + public dataset offline, load the `.pkl` in FastAPI, expose predictions.
9. **Camera component (A core + E safeguard + optional B)** — add last, once specs are locked with the client/supervisor. Slots into the existing monitoring session.
10. **Dashboards** — admin content + risk view, parent engagement + prediction view, admin analytics.

Steps 1–8 and 10 are **completely independent of the camera decision**, so you can build the entire application now and drop the camera in at step 9 without rework — the `attention_scores` table and monitoring endpoints are already there waiting for it.

---

## 8. Summary: Answers to Your Direct Questions

- **Are A + B + E the best options?** Yes — they layer into one pipeline (E verifies → A measures → B analyses) and cover integrity, core variable, and novelty without the complexity of C/D or the shakiness of F.
- **Do we train other models besides the parent camera?** Only **one** real trained model: the performance predictor (scikit-learn, classic ML). The engagement scorer is a **formula**, the gaze detection is a **pre-trained MediaPipe model** you call, and the attention-quality classifier is an **optional** small model (your novelty). The camera isn't even really a "trained" model — it's MediaPipe + your logic.
- **Do we need Hugging Face?** **No** for v1. MediaPipe (gaze) + scikit-learn (prediction) is lighter and better-suited. Hugging Face only if you later add a chatbot or auto-quiz-generation.
- **Database schema?** Full Supabase/PostgreSQL DDL in Section 4, with RLS as the role-based security backbone.
- **FastAPI?** Yes — structure and Supabase integration pattern in Section 5. Rule of thumb: plain data can go direct to Supabase (protected by RLS); ML and complex logic go through FastAPI.
