-- ============================================================
-- Migration: Per-student optional subjects (2026-07-30)
-- Run once against the EXISTING Supabase project (SQL editor).
-- Idempotent: safe to re-run. schema.sql already contains the same
-- objects for fresh setups.
-- ============================================================

-- Every subject that already exists becomes CORE, so current behaviour is
-- unchanged: all students keep seeing all subjects. Reclassify the electives
-- afterwards from the admin Materials screen (or with the UPDATE below).
alter table subjects
  add column if not exists is_core boolean not null default true;

create table if not exists child_subjects (
  id uuid primary key default gen_random_uuid(),
  child_id    uuid not null references profiles(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  assigned_by uuid references profiles(id),
  created_at  timestamptz default now(),
  unique (child_id, subject_id)
);

alter table child_subjects enable row level security;

-- Optional: mark your electives as optional in one go, e.g.
-- update subjects set is_core = false
--  where name in ('ICT', 'Business & Accounting Studies', 'Art', 'Music');
