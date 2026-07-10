-- ============================================================
-- Migration: Notifications + Report Cards (2026-07-10)
-- Run once against the EXISTING Supabase project (SQL editor).
-- Idempotent: safe to re-run. schema.sql already contains the same
-- objects for fresh setups.
-- ============================================================

-- 1. Quiz deadline (drives lazy 'quiz_due' notifications)
alter table quizzes add column if not exists due_date timestamptz;

-- 2. Notifications (in-app, parent-facing; API-only writes)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null,          -- 'quiz_result' | 'quiz_due' | 'report_card' | 'risk_alert'
  title text not null,
  body text not null,
  child_id uuid references profiles(id) on delete cascade,
  related_id uuid,             -- quiz_id / report_card_id / prediction id (polymorphic, no FK)
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists notifications_recipient_idx on notifications(recipient_id, read_at);

-- 3. Report cards (admin PDF per student per term)
create table if not exists report_cards (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id) on delete cascade,
  term text not null,
  title text,
  storage_path text not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz default now()
);
create index if not exists report_cards_child_idx on report_cards(child_id);

-- 4. RLS: API-only (service-role bypasses RLS). No select policies.
alter table notifications enable row level security;
alter table report_cards enable row level security;

-- 5. Private storage bucket for report-card PDFs.
--    If this doesn't stick (buckets can be flaky from SQL on existing
--    projects), create it manually: Storage > New bucket > name
--    'report-cards', Public = OFF.
insert into storage.buckets (id, name, public)
values ('report-cards', 'report-cards', false)
on conflict (id) do nothing;
