# Phase 6 — Dashboards (Design)

**Date:** 2026-07-10
**Status:** Approved (design), pending implementation plan
**Plan reference:** `Implementation_Plan_Updated.md` §"Phase 6 — Dashboards"

## Context

Phases 0–5 are done. Each role already has a working dashboard built incrementally
across the earlier phases (Admin console, Parent Portal, child My-Learning, plus the
Phase 5 risk cards and admin risk roster stub). Phase 6 is therefore **not** a
from-scratch build — it is an integration + polish pass that adds the three pieces the
plan lists but that were never built, and applies the cross-cutting design principles.

The three genuinely-new pieces:
1. Admin — a class roster **sorted by risk band**.
2. Admin — a **student detail** view with **intervention notes**.
3. Parent — an **engagement trend** over time.

Everything else in the Phase 6 checklist (content management, user management,
parent-child linking, model health, parent overview/activity/quiz-scores, child
progress-without-risk) already exists and only needs a verification + copy pass.

## Design decisions (with rationale)

### Intervention notes — admin-only, private
A new `intervention_notes` table, written and read **only by admins**. Rationale:
- The plan lists intervention notes under the *Admin dashboard* tasks only, not the
  parent dashboard — it is scoped as a staff-facing case log.
- A `messages` table already exists for parent↔admin two-way communication; making
  notes a second thread would duplicate it. Notes are a one-way staff log
  ("Flagged high-risk → called parent 2026-07-08 → agreed weekly check-ins").
- Keeping internal staff notes private protects the support-not-blame principle: a
  parent should not read a blunt "at-risk" case note out of context.

### Student detail — dedicated full page
Route `/admin/students/:id`. Rationale: the view aggregates prediction + academics +
activity + quiz scores + the notes log — too much for a drawer or an inline row
expansion. A real route also gives a shareable URL and room for charts, and matches
the plan treating "student detail" as a first-class view.

### Parent engagement trend — line chart, engagement index only
A Recharts line/area chart of the engagement index over `engagement_index.period`,
beside the existing current-value card. Risk-band history is **not** charted here
(YAGNI — the current risk card already shows the latest band; a parent trend line for
a 3-level categorical band adds little). `recharts@^3.9.2` is already a dependency —
no new package.

## Components

### 1. Admin: risk-sorted class roster
- **Where:** a new section/tab in the Admin console.
- **Data:** every child + their latest `predictions` row (risk_band, risk_score) and
  last `student_activity` timestamp.
- **Sort:** risk band high → medium → low (high first, so at-risk students surface at
  top); secondary sort by risk_score desc within a band.
- **Row:** name, grade, risk-band badge, risk score, last-activity date.
- **Reuse:** the existing Users-table search box + clickable stat-card band filters
  and hover-row patterns.
- **Interaction:** clicking a row navigates to the student detail page.
- **Backend:** `GET /admin/students/roster` — returns children joined with their
  latest prediction + last-activity, pre-sorted server-side.

### 2. Admin: student detail page + intervention notes
- **Route:** `/admin/students/:id` (admin-only route guard).
- **Sections:**
  - Header — name, grade, current risk-band badge.
  - Prediction — band + confidence + explained top factors (reuses Phase 5
    `GET /predictions/{child_id}`).
  - Academics — `academic_records` per term (assessment/exam/attendance).
  - Activity — recent `student_activity` timeline + quiz scores.
  - Intervention notes — add-note form + reverse-chronological log.
- **New table:** `intervention_notes (id uuid pk, child_id uuid fk→profiles,
  author_id uuid fk→profiles, body text, created_at timestamptz default now())`.
  RLS: no direct client access; all reads/writes go through the API with the
  service-role key (RLS-vs-API golden rule). Author must be an admin.
- **New backend:**
  - `GET /admin/students/{id}` — aggregate detail (profile + academics + activity +
    quiz attempts). May compose existing queries.
  - `GET /admin/students/{id}/notes` — list notes, newest first.
  - `POST /admin/students/{id}/notes` — create a note (admin only).

### 3. Parent: engagement trend
- **Where:** Parent Overview, beside the existing engagement-index card.
- **Data:** `engagement_index` rows for the selected child, ordered by period.
- **Chart:** Recharts line/area, x = period, y = engagement_index (0–1). Tooltip
  shows the exact value + period. Empty/low-data state when < 2 points ("Not enough
  history yet").
- **New backend:** `GET /engagement/{child_id}/history` — parent-linked or admin;
  returns the ordered series. Authorization checked against `parent_child_link` (same
  guard as the existing engagement endpoint).

### Cross-cutting polish
- Support-not-blame phrasing pass on all parent-facing risk copy.
- Verify the Phase 5 dashboards render correctly in the browser (the loose end from
  the 2026-07-09 session — the data path was verified but the UI was never clicked
  through). Do this as part of Phase 6 verification, using the running dev server at
  `localhost:5173`.
- No child-facing risk prediction anywhere (unchanged invariant).

## Data flow

```
Admin roster:   GET /admin/students/roster
                  → profiles(role=child) ⨝ latest predictions ⨝ last student_activity
                  → sorted high→low → roster table

Student detail: GET /admin/students/:id → profile + academic_records + activity + attempts
                GET /admin/students/:id/notes → intervention_notes (desc)
                POST /admin/students/:id/notes → insert (author = current admin)
                GET /predictions/:id (existing, Phase 5) → risk card

Parent trend:   GET /engagement/:child_id/history → engagement_index series (by period)
                  → Recharts line chart on Parent Overview
```

## Error handling
- All new admin endpoints: `require_role("admin")`; 403 otherwise.
- Engagement history: reuse the existing parent-link authorization check (403 if the
  parent is not linked to that child).
- Notes: reject empty body (400); author_id set server-side from the authenticated
  admin, never trusted from the client.
- Frontend: every new fetch is best-effort with an empty state — a child with no
  predictions / no engagement history / no notes shows an empty state, never a broken
  page (matches the Phase 5 parent-card pattern).

## Testing / verification
- Backend: Python import + route-registration check; manual endpoint exercise against
  live Supabase for the roster, a student detail, note create, and engagement history.
- Frontend: `tsc --noEmit` clean.
- **In-browser** (using `localhost:5173`, the running dev server): log in as admin →
  open the risk roster → confirm high-risk sorts first → open a student detail →
  add an intervention note → confirm it persists on reload. Then as a parent → open a
  linked child's Overview → confirm the engagement trend chart renders (and its empty
  state for a child with one data point). This pass also clears the outstanding Phase 5
  browser-verification gap.
- Clean up any test/demo data afterward (real Supabase project — established habit;
  `python -m app.scripts.seed_demo --clear` for the Phase 5 demo rows).

## YAGNI — explicitly out of scope
- No parent↔admin note threading (the `messages` table already covers messaging; not
  wired into Phase 6).
- No risk-band history chart on the parent view.
- No new charting dependency (Recharts already present).
- No unrelated refactoring of the existing dashboards.

## Schema migration note
Adding `intervention_notes` is an additive `create table` — safe on the existing
Supabase project (no change to existing tables). Add it to `supabase/schema.sql` and
create it on the live DB.
