# Interactive UI for all portals — design (2026-07-08)

**Goal:** Extend the Admin dashboard's interactive treatment (search, filters, hover actions, rich stat cards) to the Teacher, Parent, and Child portals, raising the whole app to the polish level of the MUI dashboard templates / FreeFrontend references the user supplied — implemented in the existing Tailwind + warm-brand design system (`#8c7569` / `#55311c`, Nunito), **not** by adopting MUI. Decisions confirmed by user: inspiration-only (keep Tailwind system), all portals, add charts via recharts.

## Shared foundation

- **`ui/StatCard`** — new primitive: icon in a soft brand tile, small label, big value, optional sub-text. Replaces the ad-hoc stat cards in Parent/Child; Admin's clickable role-filter cards keep their button behavior but adopt the same visual language.
- **recharts** — new dependency. Brand-styled wrappers in `components/charts/`: `TrendChart` (area/line over time) and `BarsChart` (per-category bars). One place defines stroke/fill/tooltip/axis styling so every chart matches.
- **Search + filter chips** — same interaction pattern as Admin (search input in card header, clickable chips/cards as filters).
- **Accent cleanup** — leftover first-draft accents (blue/violet icon tiles, indigo links and file-input in Teacher/Child pages) normalized to brand palette. Role badges keep per-role colors (by design).

## Per portal

**Teacher** (`pages/teacher/Dashboard.tsx`)
- Stat row: subjects / materials / quizzes / total attempts on this teacher's quizzes.
- Materials: search + type filter chips, brand icon tiles.
- Quizzes: attempt counts, "View results" opens a results view — table of student attempts (name, score, %, date) + bar chart of average score per quiz.

**Parent** (`pages/parent/Dashboard.tsx`)
- Overview: StatCards + activity-over-last-14-days area chart + quiz-score-% trend line.
- Activity history: filter chips by action type, per-action icons, material titles shown.
- Quiz scores: table with quiz title, score, %, date, colored score badge.
- Sessions: summary stats above the existing table.

**Child** (`pages/child/Dashboard.tsx`)
- Learn: subject dropdown replaced by clickable subject card grid; materials with type filter chips; quizzes show best previous score.
- Progress: StatCards + score trend chart + icon timeline. Never shows risk predictions (project rule).

## Backend (additive only, no schema changes)

1. `GET /quizzes/attempts/me` and `GET /parent/children/{id}/quiz-attempts` → enrich rows with `quiz_title` (manual join, codebase style).
2. `GET /activity/me` and `GET /parent/children/{id}/activity` → enrich with `material_title`.
3. **New** `GET /quizzes/{quiz_id}/attempts` — teacher/admin only; a teacher may only read attempts for quizzes they created (`created_by` check); rows enriched with `child_name`.

All writes/role-checked reads stay in FastAPI per the project's RLS-vs-API golden rule.

## Verification

`tsc --noEmit`; both dev servers; throwaway Playwright drive through all four roles; delete all test data created for verification (established routine — this is the real Supabase project).

---

## Addendum (same day): blue retheme + dark mode

After the above shipped and passed verification, the user supplied a dashboard mockup (blue SaaS style) and requested it replace the warm-brown look, then asked for a dark mode.

- **Palette:** primary `#4665f2` / hover `#3550d4`, slate neutrals, across every page including Login. Per-role accent colors returned (admin indigo / teacher teal / parent amber / child violet) for stat cards (tinted icon tile + bottom underline bar), donut slices, and per-role bars. Chart role palettes are CVD/contrast-validated per theme: light `#4f46e5/#0d9488/#d97706/#9333ea`, dark `#6366f1/#0d9488/#d97706/#a855f7`.
- **Admin dashboard:** subtitle, Status column (Active pill), always-visible eye/pencil/trash actions (eye = read-only detail modal), and a right rail with a "User distribution" donut (hover-highlight, center total, legend with counts) + "Accounts by role" bars.
- **Dark mode:** class-based (`.dark` on `<html>`, Tailwind v4 `@custom-variant`), toggled from the sidebar footer and the login page, persisted in `localStorage.theme`, defaulting to the OS preference. Chart colors resolve through CSS variables in `index.css` so recharts follows the active theme.
- The animated-donut CodePen the user referenced uses GSAP's paid DrawSVG plugin; the donut was built with recharts instead (user approved).
