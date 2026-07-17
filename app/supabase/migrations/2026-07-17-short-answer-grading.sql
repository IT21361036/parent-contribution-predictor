-- ============================================================
-- Migration: Short-answer quiz grading (2026-07-17)
-- Run once against the EXISTING Supabase project (SQL editor).
-- Idempotent: safe to re-run. schema.sql already contains the same
-- objects for fresh setups.
-- ============================================================

-- MCQs auto-grade on submit; short-answer questions need an admin to award
-- marks. We persist the per-question marks so grading is reviewable/editable
-- and the final `score` can be recomputed as MCQ auto + short-answer manual.

-- 1. Per-question awarded marks: { "<question_id>": <marks>, ... }
--    (a short-answer key is absent until an admin grades it).
alter table quiz_attempts add column if not exists question_scores jsonb;

-- 2. false while the attempt still has ungraded short-answer questions.
--    Fully auto-graded (MCQ-only) attempts stay true.
alter table quiz_attempts add column if not exists graded boolean not null default true;

-- Existing attempts predate grading and were MCQ-only in practice — leave them
-- marked graded=true (the default above already covers back-filled rows).
