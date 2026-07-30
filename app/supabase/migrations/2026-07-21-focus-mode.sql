-- ============================================================
-- Migration: Focus mode — monitoring interruption tracking (2026-07-21)
-- Run once against the EXISTING Supabase project (SQL editor).
-- Idempotent: safe to re-run. schema.sql already contains the same
-- objects for fresh setups.
-- ============================================================

-- The parent portal now detects when the parent leaves the tab/window during a
-- monitoring session (switches to another tab, another app, etc.) and shows a
-- blocking "monitoring paused" overlay. Each such leave is logged on the session
-- so the interruption is visible in history/analytics.

-- Number of times the parent left the portal during the session.
alter table monitoring_sessions add column if not exists focus_losses int default 0;

-- Total seconds the parent spent away from the portal during the session.
alter table monitoring_sessions add column if not exists away_seconds int default 0;
