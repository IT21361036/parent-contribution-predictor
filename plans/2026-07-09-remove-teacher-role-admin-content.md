# Remove the teacher role; fold content tools into Admin — design (2026-07-09)

**Goal:** Align the codebase with the updated plan §3.1: there is **no separate
teacher role**. Everything the teacher used to do (subjects, materials, quizzes,
attempt review) is now an **admin** capability, surfaced as a content-management
area in the admin sidebar. The user made the decision in the plan MDs first; this
session brought schema, backend, frontend, and docs into line.

## Decision (confirmed with user)

How should the former teacher tools appear in the Admin portal?
- **Chosen — flat sidebar entries.** Admin sidebar becomes
  **Users · Parent↔Child Links · Materials · Quizzes**. Matches the plan wording
  ("a content-management area in the admin sidebar"), keeps everything at one nav
  level (no nested tabs-in-a-section), and reuses the existing content UI with the
  least new state.
- Rejected — a single "Content" entry opening internal Materials/Quizzes sub-tabs
  (more nesting, extra state, no real benefit at this scale).

## Changes by layer

**Schema** (`app/supabase/schema.sql`)
- `user_role` enum `('admin','teacher','parent','child')` → `('admin','parent','child')`.
- Comments updated ("Admin Content Tools", admin-only writes).
- ⚠️ Migration note: Postgres can't drop an in-use enum value in place. On an
  already-seeded DB, reassign any `teacher` rows to `admin` and migrate the enum,
  or re-run the schema on a fresh project. The edited file is correct for a clean setup.

**Backend** (`app/backend/app/routers/`)
- `materials.py`, `subjects.py`, `quizzes.py`: `require_role("admin","teacher")` → `require_role("admin")`.
- `quizzes.py`: attempt-count visibility gated on `role == "admin"`; removed the
  teacher "only your own quiz" 403 branch (admins see all attempts).
- `admin.py`: dropped `"teacher"` from the create/update role-validation sets.

**Frontend** (`app/frontend/src/`)
- `lib/types.ts`: `UserRole` drops `'teacher'`.
- `lib/theme.ts`, `charts/chartTheme.ts`, `index.css`: removed teacher badge tone,
  role accent, and the `--role-teacher` CSS variable (both themes).
- `pages/RoleRouter.tsx` + `App.tsx`: removed the `/teacher` route, its redirect, and
  the `TeacherDashboard` import.
- **`pages/admin/ContentManager.tsx` (new)**: the old teacher content UI (subject
  picker, materials list + upload, quiz builder, results modal) with the
  `PortalLayout`/nav stripped and the active section (`'materials' | 'quizzes'`)
  lifted to a prop driven by the admin sidebar.
- **`pages/admin/Dashboard.tsx`**: sidebar gains Materials + Quizzes; those sections
  render `ContentManager`; role stat tiles/badges/icons drop teacher; a
  `SECTION_META` map supplies per-section title/subtitle; header action button
  shows only on Users/Links.
- Deleted `pages/teacher/Dashboard.tsx` and the empty `teacher/` folder.

**Docs**: `app/README.md` role list, first-run steps, and Phase 1/2 notes updated
(with an explicit "no separate teacher role" note).

## Addendum (same day): dark-mode dropdown fix

The user hit a native `<select>` rendering its open popup/`<option>` list in **light**
colors while the rest of the page was dark (screenshot from the Materials subject
picker). Cause: a native select paints its dropdown from the element's own
`color-scheme`, not from any Tailwind `bg-*` class — `ui/Field.tsx`'s `Select` set
neither, so the popup fell back to white in dark mode.

- **Fix (one shared component):** `Select` now carries
  `bg-white dark:bg-slate-900 dark:[color-scheme:dark]`, so the closed control has a
  solid surface and the open list matches the dark theme. Applying it on the shared
  `Select` fixes materials, quizzes, and every other dropdown (admin create/edit
  user, parent/child selectors) consistently — not just the two screens named.

## Verification
- `tsc --noEmit` on the frontend — clean (exit 0).
- Remaining `teacher` mentions are intentional: the README "no separate teacher
  role" note, a `ContentManager` code comment, and student-facing copy in the Child
  dashboard ("your teachers…") which is natural language, not role wiring — left as-is
  pending user preference.
- Recommend a quick in-browser check of the dark-mode dropdown popup (per the
  established verify-in-browser habit).
