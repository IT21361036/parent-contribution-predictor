# Design — Per-student optional (elective) subjects

**Date:** 2026-07-30
**Status:** Approved (design), not yet implemented
**Scope:** Admin assigns each O/L student their own set of optional subjects; the
child portal then shows only the subjects that student actually takes.

---

## 1. Problem

Sri Lanka's O/L curriculum is roughly six compulsory subjects plus three
optional ones chosen from baskets. Two students in the same grade therefore
study different subject sets.

The system currently has no concept of this. `subjects` is one flat global list
(`id`, `name`, `grade_level`), and the child dashboard fetches **every** subject
via `GET /subjects` and renders them all
(`frontend/src/pages/child/Dashboard.tsx`). Every student sees every subject,
including electives they do not take.

This feature is net-new: no mention of optional subjects, electives, baskets or
core subjects exists anywhere in `client01/plans/`, so it sits on top of the
8-phase plan rather than inside it.

## 2. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Core vs optional | Flag subjects `is_core`; core auto-visible to all, only optionals assigned | Mirrors the real O/L structure; ~3 selections per student instead of ~9 |
| Enforcement | Server-side in FastAPI | Follows the RLS-vs-API golden rule; a student cannot reach another basket's content via devtools |
| Admin UI | New card on the existing `/admin/students/:id` page | That page is already the per-student hub and has room for a grouped checkbox list |
| Migration | `is_core` defaults to `true` | Zero regression — every current subject stays visible exactly as today |
| Storage | Join table `child_subjects` | FK integrity + cascade deletes; an array column on `profiles` gives neither |

### Rejected alternatives

- **RLS policies on `subjects`/`learning_materials`/`quizzes`.** Would never
  fire: all reads go through `get_service_client()`, which bypasses RLS by
  design. Making it work would mean moving child reads to direct-to-Supabase —
  far larger than this feature warrants.
- **`profiles.optional_subject_ids uuid[]`.** Fewer queries, but no foreign-key
  integrity (a deleted subject leaves dangling ids) and "which students take
  ICT" degrades to an array scan.
- **Basket rules** ("exactly one subject per basket 1–3"). More faithful to the
  syllabus, but the validation and schema cost is not justified yet.

## 3. Schema

Applied to `app/supabase/schema.sql` (fresh installs) **and** a new
`app/supabase/migrations/2026-07-30-optional-subjects.sql` (existing databases),
matching the dated naming already used in that folder.

```sql
-- Core subjects are taken by every student; optional ones are assigned per child.
-- Default true so existing rows keep their current always-visible behaviour.
alter table subjects add column is_core boolean not null default true;

-- Which optional subjects a given child takes. Core subjects are NOT stored
-- here — they are implicit for every child.
create table child_subjects (
  id uuid primary key default gen_random_uuid(),
  child_id    uuid not null references profiles(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  assigned_by uuid references profiles(id),
  created_at  timestamptz default now(),
  unique (child_id, subject_id)
);

-- Service-role API only, like intervention_notes: RLS on, no policy.
alter table child_subjects enable row level security;
```

Both cascades are deliberate: deleting a subject or a student removes its
assignments automatically, so `_cascade_delete_user_data` in
`app/routers/admin.py` needs no new manual cleanup step.

## 4. Backend

### 4.1 New module: `app/services/subject_access.py`

Single responsibility — resolve and enforce which subjects a child may see.
Depends only on a Supabase client passed in, so it is unit-testable.

```python
def core_subject_ids(client) -> set[str]
    """Ids of every subject where is_core is true."""

def allowed_subject_ids(client, child_id: str) -> set[str]
    """core_subject_ids ∪ the child's assigned optional subject ids."""

def assert_subject_allowed(client, user: CurrentUser, subject_id: str) -> None
    """Raise 403 if user.role == 'child' and subject_id is outside their set.
    No-op for admin and parent roles."""
```

### 4.2 Endpoints gated for the `child` role

| Endpoint | Change |
|---|---|
| `GET /subjects` | Child receives core + assigned only; admin/parent unchanged |
| `GET /materials` | Child: filter to allowed subject ids |
| `GET /materials?subject_id=X` | Child: 403 if X not allowed |
| `GET /materials/{id}/download` | Child: look up the material's `subject_id`, 403 if not allowed — **currently unguarded** |
| `GET /quizzes` | Child: filter to allowed subject ids |
| `GET /quizzes?subject_id=X` | Child: 403 if X not allowed |
| `GET /quizzes/{id}` | Child: 403 if the quiz's subject is not allowed |
| `POST /quizzes/{id}/attempts` | Child: 403 — **currently unguarded**; without this a student could submit an attempt on a subject they do not take and corrupt their own score history and the predictor's features |

Admin and parent endpoints keep full visibility; nothing in the parent portal or
the ML feature pipeline changes (the pipeline does not reference subjects).

### 4.3 New admin endpoints

On the existing `app/routers/students.py` router (prefix `/admin/students`,
guarded by `require_role("admin")`), reusing its `_get_child_or_404` helper so a
bad id returns 404 rather than 500.

```
GET /admin/students/{child_id}/subjects
  -> { core: Subject[], optional: Subject[], assigned_ids: string[] }

PUT /admin/students/{child_id}/subjects
  body: { subject_ids: string[] }
  -> { assigned_ids: string[] }
```

`PUT` replaces the child's whole optional set in one call, matching a checkbox
form that saves once. Validation, all 400s:

- an id that does not exist in `subjects`
- an id whose subject is `is_core` (core is implicit, never assigned)
- duplicate ids in the payload

`assigned_by` is set from the authenticated admin.

Route ordering: `/roster` must stay declared before `/{child_id}` as it is
today. `/{child_id}/subjects` has an extra path segment so it does not collide
and may be declared after.

### 4.4 Subject management

- `POST /subjects` accepts `is_core: bool = True`.
- New `PATCH /subjects/{id}` updates `name`, `grade_level` and/or `is_core`.
  Uses Pydantic `exclude_unset` (not a `None`-filter) so `grade_level` can be
  explicitly nulled, matching the convention already used by
  `PATCH /admin/users/{id}`. This is how the electives already in the database
  get reclassified, without hand-written SQL.

**Flipping optional → core.** When a subject becomes core it is implicit for
every child, so any `child_subjects` rows for it are deleted in the same
request. Without this the table would keep rows that no longer mean anything,
and flipping back to optional would silently restore stale assignments.
Flipping core → optional needs no cleanup: there are no rows yet, and the
subject simply disappears from every child's view until assigned.

## 5. Frontend

| File | Change |
|---|---|
| `pages/admin/StudentDetail.tsx` | New `OptionalSubjectsCard`: core subjects listed read-only as "automatic", optional subjects as checkboxes, one Save button |
| `pages/admin/ContentManager.tsx` | `is_core` toggle in `CreateSubjectModal`; Core/Optional badge in the subject list |
| `lib/types.ts` | `Subject` gains `is_core: boolean` |
| `pages/child/Dashboard.tsx` | **No change** — it already renders whatever `/subjects` returns, so server filtering is sufficient |

`OptionalSubjectsCard` is built from the existing `components/ui/` primitives
(`Card`, `Button`, `Alert`, `Spinner`, `EmptyState`, `Badge`) and every themed
class carries a `dark:` companion, per the Aurora Glass design system. It sits
alongside the page's existing Performance risk / Academic records / Report cards
cards.

## 6. Error handling

- Gated reads return 403 with a readable `detail`; the child dashboard's
  existing `setError` path surfaces it without a blank screen.
- A student with no assignments sees core subjects and an empty optional set —
  a valid, non-broken state, not an error.
- `PUT` against a non-child profile returns 404 via `_get_child_or_404`.
- Deleting a subject that students are assigned to succeeds; the FK cascade
  removes the assignments.

## 7. Testing

Backend, pytest against the in-memory fake client in `tests/conftest.py`:

- `allowed_subject_ids` returns core ∪ assigned, and core alone when a child has
  no assignments
- 403 for a child on each gated endpoint: material list, material download,
  quiz detail, attempt submission
- 200 for the same endpoints when the subject is core, and when it is an
  assigned optional
- admin and parent are never filtered
- `PUT` replace-semantics: adding, removing, and clearing the set
- `PUT` 400s: unknown id, core id, duplicate ids
- `PATCH /subjects/{id}` flipping optional → core deletes that subject's
  assignments, and the subject then appears for a child who was never assigned it

Frontend: `tsc -b && vite build` clean. Manual check that the admin card saves
and that a child's dashboard reflects the change after reload.

## 8. Out of scope

- Basket rules ("exactly one per basket")
- Parent-dashboard and admin-analytics subject scoping — the parent already only
  sees activity the child actually generated
- Optional-subject assignment in `scripts/seed_demo.py` — can be added later if
  demo databases should showcase the feature
- Any change to the engagement scorer or risk predictor
