-- ============================================================
-- O/L LMS + Parental Monitoring — full schema (Phases 0-7)
-- Paste into the Supabase SQL editor and run once on a fresh project.
-- Tables for later phases are created now so nothing needs a migration
-- later (see Implementation_Plan_Updated.md, "principle that makes
-- deferring safe").
-- ============================================================

create extension if not exists pgcrypto;

-- ========== USERS & ROLES ==========
-- auth.users is managed by Supabase Auth. profiles adds role + details.

create type user_role as enum ('admin', 'parent', 'child');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  email text unique,
  grade_level text,           -- for children, e.g. 'O/L', 'Grade 11'
  created_at timestamptz default now()
);

-- ========== PARENT <-> CHILD LINK ==========
create table parent_child_link (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references profiles(id) on delete cascade,
  child_id  uuid not null references profiles(id) on delete cascade,
  relationship text,          -- 'mother','father','guardian'
  created_at timestamptz default now(),
  unique (parent_id, child_id)
);

-- ========== SUBJECTS ==========
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_level text,
  created_at timestamptz default now()
);

-- ========== LEARNING MATERIALS (docs, videos, exams) ==========
create type material_type as enum ('document', 'video', 'exam_paper', 'slide');

create table learning_materials (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references profiles(id),
  subject_id uuid references subjects(id),
  title text not null,
  description text,
  type material_type not null,
  storage_path text not null,  -- Supabase Storage path, or video-host asset id
  duration_seconds int,        -- for videos
  created_at timestamptz default now()
);

-- ========== QUIZZES ==========
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id),
  subject_id uuid references subjects(id),
  title text not null,
  total_marks int,
  due_date timestamptz,        -- optional deadline; drives lazy 'quiz_due' notifications
  created_at timestamptz default now()
);

create type question_type as enum ('mcq', 'short_answer');

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  question_text text not null,
  type question_type not null,
  options jsonb,               -- for MCQ: ["A","B","C","D"]
  correct_answer text,         -- for auto-grading MCQs
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

-- ========== STUDENT ACTIVITY (feeds the performance predictor) ==========
create type activity_action as enum ('view', 'download', 'video_watch', 'quiz_start', 'quiz_submit');

create table student_activity (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  material_id uuid references learning_materials(id),
  action activity_action not null,
  time_spent_seconds int,
  watch_percent numeric,       -- for videos (0-100)
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
  camera_enabled boolean default false,   -- Phase 7 socket
  liveness_passed boolean
);

-- ========== ATTENTION SCORES (Phase 7 camera output — numbers only, no video) ==========
create table attention_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references monitoring_sessions(id) on delete cascade,
  attention_score numeric,     -- 0..1
  attentive_seconds int,
  total_seconds int,
  gaze_consistency numeric,
  focus_quality numeric,
  computed_at timestamptz default now()
);

-- ========== ENGAGEMENT INDEX (rule-based scorer output) ==========
create table engagement_index (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  period text,                 -- e.g. 'week-2026-01'
  monitoring_hours numeric,
  check_frequency numeric,
  avg_attention_score numeric,
  engagement_index numeric,
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

-- ========== PREDICTIONS (performance predictor output) ==========
create table predictions (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  term text,
  model_version text,
  risk_band text,              -- 'low','medium','high'
  risk_score numeric,
  top_factors jsonb,
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

-- ========== INTERVENTION NOTES (admin-only staff case log) ==========
create table intervention_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  author_id uuid not null references profiles(id),   -- the admin who wrote it
  body text not null,
  created_at timestamptz default now()
);
create index intervention_notes_child_idx on intervention_notes(child_id);

-- ========== NOTIFICATIONS (in-app; parent-facing) ==========
-- Created only by the FastAPI backend (service-role key) on defined events:
-- quiz_result, quiz_due (generated lazily), report_card, risk_alert.
-- Reading one sets read_at, which also feeds the engagement scorer
-- (folded into check_frequency — no ML retrain).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,  -- the parent
  type text not null,          -- 'quiz_result' | 'quiz_due' | 'report_card' | 'risk_alert'
  title text not null,
  body text not null,
  child_id uuid references profiles(id) on delete cascade,   -- the child it concerns
  related_id uuid,             -- quiz_id / report_card_id / prediction id (no FK: polymorphic)
  read_at timestamptz,         -- set when the parent opens it — drives the scoring impact
  created_at timestamptz default now()
);
create index notifications_recipient_idx on notifications(recipient_id, read_at);

-- ========== REPORT CARDS (admin uploads a PDF per student per term) ==========
create table report_cards (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  term text not null,          -- e.g. '2025 Term 1'
  title text,
  storage_path text not null,  -- PDF in the private 'report-cards' bucket
  uploaded_by uuid not null references profiles(id),  -- the admin
  created_at timestamptz default now()
);
create index report_cards_child_idx on report_cards(child_id);

-- ============================================================
-- ROW-LEVEL SECURITY
-- Enabled on every table now, so nothing is world-readable by default
-- even before a phase's policies are written. Policies below cover only
-- what Phase 1 (auth & roles) needs; later phases add their own policies
-- as those features are built (see the FastAPI "golden rule": simple
-- reads can go direct-to-Supabase under RLS, everything else goes
-- through the API using the service-role key, which bypasses RLS).
-- ============================================================

alter table profiles enable row level security;
alter table parent_child_link enable row level security;
alter table subjects enable row level security;
alter table learning_materials enable row level security;
alter table quizzes enable row level security;
alter table quiz_questions enable row level security;
alter table quiz_attempts enable row level security;
alter table student_activity enable row level security;
alter table monitoring_sessions enable row level security;
alter table attention_scores enable row level security;
alter table engagement_index enable row level security;
alter table academic_records enable row level security;
alter table predictions enable row level security;
alter table messages enable row level security;
alter table intervention_notes enable row level security;
alter table notifications enable row level security;
alter table report_cards enable row level security;
-- notifications & report_cards are API-only (service-role key bypasses RLS);
-- no select policies, so they are never world- or client-readable.

-- Phase 1: a logged-in user can read their own profile row.
-- (Role changes and creating admin/parent profiles happen only
-- through the FastAPI admin endpoints, using the service-role key, which
-- bypasses RLS entirely.)
create policy "profiles_select_own"
  on profiles for select
  using (id = auth.uid());

-- Phase 1: a parent can see their own links; a child can see who
-- monitors them. This is the policy that stops a parent from ever
-- reading another family's child.
create policy "parent_child_link_select_own"
  on parent_child_link for select
  using (parent_id = auth.uid() or child_id = auth.uid());

-- ============================================================
-- SELF-SIGNUP: create the profile row server-side, not from the client
-- A client-side insert races the session: if "Confirm email" is on (or
-- even just on a slow network), the browser has no active session yet
-- when the insert fires, auth.uid() is null, and RLS rejects the row.
-- A trigger with `security definer` runs as the table owner and creates
-- the row the instant the auth user exists — no session, no RLS timing
-- dependency, no insert policy needed on profiles at all.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    'child',
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- STORAGE
-- Uploads and downloads both go through the FastAPI backend using the
-- service-role key, which bypasses storage RLS entirely — so the bucket
-- is created private (public = false) and needs no storage.objects
-- policies of its own.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

-- Report-card PDFs. Private; all up/downloads go through the FastAPI backend
-- with the service-role key. (Buckets don't always create reliably from this
-- SQL on an existing project — if uploads 404, create it manually in the
-- Supabase Storage UI: name 'report-cards', Public = off.)
insert into storage.buckets (id, name, public)
values ('report-cards', 'report-cards', false)
on conflict (id) do nothing;

-- ============================================================
-- Phase 2: Admin Content Tools
-- Writes (create subject/material/quiz) go through the FastAPI admin
-- endpoints with the service-role key + an admin require_role check.
-- Reads are opened up here to any authenticated user so later phases
-- (child browsing, parent viewing) don't need new policies to just
-- look at content that already exists.
-- ============================================================

create policy "subjects_select_authenticated"
  on subjects for select
  using (auth.role() = 'authenticated');

create policy "learning_materials_select_authenticated"
  on learning_materials for select
  using (auth.role() = 'authenticated');

create policy "quizzes_select_authenticated"
  on quizzes for select
  using (auth.role() = 'authenticated');

create policy "quiz_questions_select_authenticated"
  on quiz_questions for select
  using (auth.role() = 'authenticated');
