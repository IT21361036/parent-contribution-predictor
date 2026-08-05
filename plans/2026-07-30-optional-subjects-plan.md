# Per-student Optional Subjects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin assign each O/L student their own set of optional (elective) subjects, and show a child only the subjects they actually take.

**Architecture:** `subjects` gains an `is_core` flag; core subjects are implicit for every child while optional ones are assigned per child in a new `child_subjects` join table. A single service module (`app/services/subject_access.py`) resolves "which subject ids may this child see", and every child-reachable read endpoint calls it. Enforcement lives in FastAPI, not RLS, because all reads go through the service-role client — the RLS-vs-API golden rule documented in `schema.sql`.

**Tech Stack:** FastAPI + Pydantic (backend), Supabase/PostgreSQL (schema + migration), pytest with the in-memory fake Supabase client in `tests/conftest.py`, React 19 + TypeScript + Tailwind v4 (frontend).

**Design doc:** `client01/plans/2026-07-30-optional-subjects-design.md`

---

## Orientation for someone new to this codebase

Read these before starting — they explain conventions the tasks assume:

- **The golden rule** (top of `app/supabase/schema.sql` and the docstring of `app/routers/students.py`): simple authenticated reads may go direct-to-Supabase under RLS, but every write and every role check goes through FastAPI using `get_service_client()`, which **bypasses RLS**. So authorization is enforced in Python via `require_role(...)`, never in SQL policies. That is why this feature filters in Python.
- **Roles** are `admin`, `parent`, `child` (`user_role` enum). There is no teacher role. `CurrentUser` is a dataclass with `.id`, `.email`, `.role`, `.full_name` (`app/auth/dependencies.py`).
- **Tests** never touch a real database. `tests/conftest.py` provides `FakeSupabase`, a small fake reproducing only the postgrest surface the code uses: `select/insert/update/delete` + `eq/in_/order/limit` + `single/maybe_single`. `select("a, b")` ignores its arguments and returns whole rows — that is fine and expected. Auth is faked by overriding `get_current_user`, so no JWT is needed.
- **Frontend conventions:** reuse the primitives in `frontend/src/components/ui/` (`Card`, `Button`, `Alert`, `Badge`, `Field`, `Modal`, `Spinner`, `EmptyState`). There is **no** `Checkbox` primitive — use a styled `<input type="checkbox">`. Dark mode is class-based, so **every themed Tailwind class needs a `dark:` companion**. Colours come from the "Aurora Glass" system: indigo `#4F46E5` primary, violet `#9333EA` accent.
- **The app runs** as two processes: backend `uvicorn app.main:app --reload --port 8001` from `app/backend` (venv active), frontend `npm run dev` from `app/frontend`. Note port **8001** — that is what `frontend/.env`'s `VITE_API_URL` points at.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `app/supabase/migrations/2026-07-30-optional-subjects.sql` | Idempotent migration for the existing database |
| `app/backend/app/services/subject_access.py` | The only place that answers "which subjects may this child see" and raises 403 |
| `app/backend/tests/test_subject_access.py` | Unit tests for the resolver + endpoint gating tests |
| `app/frontend/src/components/admin/OptionalSubjectsCard.tsx` | Admin UI for assigning one student's optional subjects |

### Modified

| File | Change |
|---|---|
| `app/supabase/schema.sql` | `subjects.is_core` column + `child_subjects` table (fresh installs) |
| `app/backend/app/routers/subjects.py` | Filter list for children; `is_core` on create; new `PATCH` |
| `app/backend/app/routers/materials.py` | Gate list, `?subject_id=`, and download |
| `app/backend/app/routers/quizzes.py` | Gate list, detail, and attempt submission |
| `app/backend/app/routers/students.py` | `GET`/`PUT /admin/students/{child_id}/subjects` |
| `app/backend/tests/conftest.py` | Patch the fake client into the `subjects` and `students` routers |
| `app/frontend/src/lib/api.ts` | Add `apiPut` |
| `app/frontend/src/lib/types.ts` | `Subject.is_core`; new `StudentSubjects` |
| `app/frontend/src/pages/admin/StudentDetail.tsx` | Mount `OptionalSubjectsCard` |
| `app/frontend/src/pages/admin/ContentManager.tsx` | `is_core` toggle on create + Core/Optional badge |

`OptionalSubjectsCard` is a separate file rather than another inner component of `StudentDetail.tsx`, which is already ~330 lines with two inner components. It owns its own fetch, state and save, and takes only `childId`.

---

## Task 0: Branch

**Files:** none

- [ ] **Step 1: Confirm a clean tree and branch off main**

The repo root is `d:\Business\Research - FYP\client01` (the `app/` folder is inside it). You should currently be on `main` with nothing uncommitted except plan docs.

```bash
cd "d:/Business/Research - FYP/client01"
git status --porcelain
git checkout -b feat/optional-subjects
```

Expected: `git status` shows only untracked `plans/*.md` files; the checkout prints `Switched to a new branch 'feat/optional-subjects'`.

---

## Task 1: Database schema

**Files:**
- Modify: `app/supabase/schema.sql` (the `-- ========== SUBJECTS ==========` block, ~line 35)
- Create: `app/supabase/migrations/2026-07-30-optional-subjects.sql`

There is no test for this task — SQL runs in Supabase's SQL editor, and the fake test client never reads real DDL. Task 2 onward encodes the same shape in tests.

- [ ] **Step 1: Add the column and table to `schema.sql`**

Replace the existing SUBJECTS block:

```sql
-- ========== SUBJECTS ==========
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_level text,
  created_at timestamptz default now()
);
```

with:

```sql
-- ========== SUBJECTS ==========
-- O/L students all take the core subjects; optional (elective) subjects differ
-- per student and are assigned by an admin in child_subjects below.
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_level text,
  is_core boolean not null default true,
  created_at timestamptz default now()
);

-- Which optional subjects a given child takes. Core subjects are NOT stored
-- here — they are implicit for every child. Both foreign keys cascade, so
-- deleting a student or a subject cleans up its assignments automatically.
create table child_subjects (
  id uuid primary key default gen_random_uuid(),
  child_id    uuid not null references profiles(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  assigned_by uuid references profiles(id),
  created_at  timestamptz default now(),
  unique (child_id, subject_id)
);

-- Service-role API only (see the golden rule): RLS on, deliberately no policy.
alter table child_subjects enable row level security;
```

- [ ] **Step 2: Write the migration for the existing database**

Create `app/supabase/migrations/2026-07-30-optional-subjects.sql`:

```sql
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
```

- [ ] **Step 3: Apply the migration**

Open the Supabase dashboard → SQL Editor → New query, paste the whole migration file, Run.
Expected: "Success. No rows returned." Then run this check:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'subjects' and column_name = 'is_core';
```

Expected: one row, `boolean`, default `true`.

- [ ] **Step 4: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/supabase/schema.sql app/supabase/migrations/2026-07-30-optional-subjects.sql
git commit -m "feat(db): add subjects.is_core and child_subjects assignment table"
```

---

## Task 2: The subject-access resolver

**Files:**
- Create: `app/backend/app/services/subject_access.py`
- Create: `app/backend/tests/test_subject_access.py`
- Modify: `app/backend/tests/conftest.py` (the module tuple in the `client` fixture)

All commands in this task run from `app/backend` with the venv active:

```bash
cd "d:/Business/Research - FYP/client01/app/backend"
.venv\Scripts\Activate.ps1
```

- [ ] **Step 1: Write the failing tests**

Create `app/backend/tests/test_subject_access.py`:

```python
"""The resolver that decides which subjects a child may see."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.subject_access import allowed_subject_ids, assert_subject_allowed
from tests.conftest import FakeSupabase, make_user


def _seed(db: FakeSupabase) -> None:
    db.store["subjects"] = [
        {"id": "s-maths", "name": "Maths", "is_core": True},
        {"id": "s-science", "name": "Science", "is_core": True},
        {"id": "s-ict", "name": "ICT", "is_core": False},
        {"id": "s-art", "name": "Art", "is_core": False},
    ]
    db.store["child_subjects"] = [
        {"id": "cs-1", "child_id": "child-1", "subject_id": "s-ict"},
    ]


def test_allowed_ids_are_core_plus_assigned():
    db = FakeSupabase()
    _seed(db)
    assert allowed_subject_ids(db, "child-1") == {"s-maths", "s-science", "s-ict"}


def test_child_with_no_assignments_gets_core_only():
    db = FakeSupabase()
    _seed(db)
    assert allowed_subject_ids(db, "child-2") == {"s-maths", "s-science"}


def test_assert_allows_core_and_assigned_subjects():
    db = FakeSupabase()
    _seed(db)
    child = make_user("child", "child-1")
    # Neither call should raise.
    assert_subject_allowed(db, child, "s-maths")
    assert_subject_allowed(db, child, "s-ict")


def test_assert_rejects_unassigned_optional_subject():
    db = FakeSupabase()
    _seed(db)
    with pytest.raises(HTTPException) as exc:
        assert_subject_allowed(db, make_user("child", "child-1"), "s-art")
    assert exc.value.status_code == 403


def test_assert_never_filters_admin_or_parent():
    db = FakeSupabase()
    _seed(db)
    assert_subject_allowed(db, make_user("admin", "admin-1"), "s-art")
    assert_subject_allowed(db, make_user("parent", "parent-1"), "s-art")


def test_assert_ignores_a_missing_subject_id():
    """List endpoints pass None when no subject filter was supplied."""
    db = FakeSupabase()
    _seed(db)
    assert_subject_allowed(db, make_user("child", "child-1"), None)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_subject_access.py -v
```

Expected: collection error — `ModuleNotFoundError: No module named 'app.services.subject_access'`.

- [ ] **Step 3: Write the resolver**

Create `app/backend/app/services/subject_access.py`:

```python
"""Which subjects a given child may see.

Core subjects are taken by every O/L student; optional (elective) subjects are
assigned per child in ``child_subjects``. Only the ``child`` role is gated —
admins and parents are never filtered.

The gate lives here in Python rather than in an RLS policy because every read
goes through the service-role client, which bypasses RLS by design (the
RLS-vs-API golden rule at the top of schema.sql).
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser


def core_subject_ids(client) -> set[str]:
    """Ids of subjects every student takes."""
    rows = client.table("subjects").select("id").eq("is_core", True).execute().data or []
    return {r["id"] for r in rows}


def assigned_subject_ids(client, child_id: str) -> set[str]:
    """Ids of the optional subjects this child has been assigned."""
    rows = (
        client.table("child_subjects")
        .select("subject_id")
        .eq("child_id", child_id)
        .execute()
        .data
        or []
    )
    return {r["subject_id"] for r in rows}


def allowed_subject_ids(client, child_id: str) -> set[str]:
    """Every subject id this child may see: core plus their own optionals."""
    return core_subject_ids(client) | assigned_subject_ids(client, child_id)


def assert_subject_allowed(client, user: CurrentUser, subject_id: str | None) -> None:
    """Raise 403 if a child asked for a subject outside their set.

    A ``None`` subject_id means the caller supplied no subject filter — list
    endpoints filter their rows instead, so there is nothing to assert.
    """
    if user.role != "child" or subject_id is None:
        return
    if subject_id not in allowed_subject_ids(client, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This subject is not one of yours.",
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_subject_access.py -v
```

Expected: 6 passed.

- [ ] **Step 5: Wire the fake client into the two routers later tasks will test**

In `app/backend/tests/conftest.py`, find this line inside the `client` fixture:

```python
    for module in ("quizzes", "materials", "report_cards", "parent", "notifications"):
```

and change it to:

```python
    for module in ("quizzes", "materials", "report_cards", "parent", "notifications", "subjects", "students"):
```

`subject_access.py` needs no patching — it receives the client as an argument.

- [ ] **Step 6: Run the whole suite to confirm nothing regressed**

```bash
pytest -q
```

Expected: all tests pass (the pre-existing `test_engagement.py` and `test_quiz_grading.py` included).

- [ ] **Step 7: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/backend/app/services/subject_access.py app/backend/tests/test_subject_access.py app/backend/tests/conftest.py
git commit -m "feat(api): add subject-access resolver for per-child subject visibility"
```

---

## Task 3: Gate `GET /subjects`

**Files:**
- Modify: `app/backend/app/routers/subjects.py:17-21` (`list_subjects`)
- Modify: `app/backend/tests/test_subject_access.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `app/backend/tests/test_subject_access.py`:

```python
def test_child_subject_list_hides_unassigned_optionals(client, fake_db):
    _seed(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/subjects")

    assert res.status_code == 200
    assert {s["id"] for s in res.json()} == {"s-maths", "s-science", "s-ict"}


def test_admin_subject_list_shows_everything(client, fake_db):
    _seed(fake_db)
    # the client fixture defaults to an admin user

    res = client.get("/subjects")

    assert res.status_code == 200
    assert len(res.json()) == 4
```

`_seed` from Step 1 takes any `FakeSupabase`, and the `fake_db` fixture *is* one — so it seeds the fixture directly, no wrapper needed.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_subject_access.py -k subject_list -v
```

Expected: `test_child_subject_list_hides_unassigned_optionals` FAILS — the set contains all four ids including `s-art`. The admin test passes already.

- [ ] **Step 3: Filter the list for children**

In `app/backend/app/routers/subjects.py`, add the import below the existing ones:

```python
from app.services.subject_access import allowed_subject_ids
```

Then replace:

```python
@router.get("")
def list_subjects(_: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    result = client.table("subjects").select("*").order("name").execute()
    return result.data
```

with:

```python
@router.get("")
def list_subjects(user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    subjects = client.table("subjects").select("*").order("name").execute().data or []

    # A child sees the core subjects plus only their own assigned optionals.
    if user.role == "child":
        allowed = allowed_subject_ids(client, user.id)
        subjects = [s for s in subjects if s["id"] in allowed]
    return subjects
```

Note the parameter renamed from `_` to `user` — it is now read, not just enforced.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_subject_access.py -v
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/backend/app/routers/subjects.py app/backend/tests/test_subject_access.py
git commit -m "feat(api): scope GET /subjects to a child's own subjects"
```

---

## Task 4: Gate materials

**Files:**
- Modify: `app/backend/app/routers/materials.py:16-22` (`list_materials`) and `:66-80` (`get_download_url`)
- Modify: `app/backend/tests/test_subject_access.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `app/backend/tests/test_subject_access.py`:

```python
def _seed_materials(fake_db: FakeSupabase) -> None:
    _seed(fake_db)
    fake_db.store["learning_materials"] = [
        {"id": "m-1", "subject_id": "s-maths", "title": "Algebra", "storage_path": "p1"},
        {"id": "m-2", "subject_id": "s-ict", "title": "Databases", "storage_path": "p2"},
        {"id": "m-3", "subject_id": "s-art", "title": "Colour theory", "storage_path": "p3"},
    ]


def test_child_cannot_list_materials_of_unassigned_subject(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials?subject_id=s-art")

    assert res.status_code == 403


def test_child_can_list_materials_of_assigned_subject(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials?subject_id=s-ict")

    assert res.status_code == 200
    assert [m["id"] for m in res.json()] == ["m-2"]


def test_unfiltered_material_list_excludes_unassigned_subjects(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials")

    assert res.status_code == 200
    assert {m["id"] for m in res.json()} == {"m-1", "m-2"}


def test_child_cannot_download_material_of_unassigned_subject(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials/m-3/download")

    assert res.status_code == 403


def test_admin_material_list_is_never_filtered(client, fake_db):
    _seed_materials(fake_db)

    res = client.get("/materials")

    assert res.status_code == 200
    assert len(res.json()) == 3
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_subject_access.py -k material -v
```

Expected: the three child tests FAIL (200 instead of 403, and the unfiltered list returns 3 rows). `test_admin_material_list_is_never_filtered` passes already.

- [ ] **Step 3: Gate the two endpoints**

In `app/backend/app/routers/materials.py`, add below the existing imports:

```python
from app.services.subject_access import allowed_subject_ids, assert_subject_allowed
```

Replace `list_materials`:

```python
@router.get("")
def list_materials(subject_id: str | None = None, _: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    query = client.table("learning_materials").select("*").order("created_at", desc=True)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    return query.execute().data
```

with:

```python
@router.get("")
def list_materials(subject_id: str | None = None, user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    assert_subject_allowed(client, user, subject_id)

    query = client.table("learning_materials").select("*").order("created_at", desc=True)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    materials = query.execute().data or []

    # No subject filter supplied: drop the subjects this child does not take.
    if user.role == "child" and not subject_id:
        allowed = allowed_subject_ids(client, user.id)
        materials = [m for m in materials if m["subject_id"] in allowed]
    return materials
```

Then in `get_download_url`, change the signature and the select, and add the check. Replace:

```python
@router.get("/{material_id}/download")
def get_download_url(material_id: str, _: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    material = (
        client.table("learning_materials")
        .select("storage_path")
        .eq("id", material_id)
        .maybe_single()
        .execute()
        .data
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
```

with:

```python
@router.get("/{material_id}/download")
def get_download_url(material_id: str, user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    material = (
        client.table("learning_materials")
        .select("storage_path, subject_id")
        .eq("id", material_id)
        .maybe_single()
        .execute()
        .data
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    # Without this a child could download any subject's file by guessing an id.
    assert_subject_allowed(client, user, material.get("subject_id"))
```

Leave the rest of the function (the signed-URL block) untouched.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_subject_access.py -v
```

Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/backend/app/routers/materials.py app/backend/tests/test_subject_access.py
git commit -m "feat(api): gate material list and download by the child's subjects"
```

---

## Task 5: Gate quizzes

**Files:**
- Modify: `app/backend/app/routers/quizzes.py:49-66` (`list_quizzes`), `:113-120` (`get_quiz`), `:129-134` (`submit_attempt`)
- Modify: `app/backend/tests/test_subject_access.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `app/backend/tests/test_subject_access.py`:

```python
def _seed_quizzes(fake_db: FakeSupabase) -> None:
    _seed(fake_db)
    fake_db.store["quizzes"] = [
        {"id": "q-maths", "subject_id": "s-maths", "title": "Algebra test", "total_marks": 1},
        {"id": "q-art", "subject_id": "s-art", "title": "Colour test", "total_marks": 1},
    ]
    fake_db.store["quiz_questions"] = [
        {"id": "qq-1", "quiz_id": "q-art", "question_text": "Primary?",
         "type": "mcq", "options": ["Red", "Green"], "correct_answer": "Red", "marks": 1},
    ]


def test_child_cannot_open_quiz_of_unassigned_subject(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/quizzes/q-art")

    assert res.status_code == 403


def test_child_cannot_submit_attempt_for_unassigned_subject(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.post(
        "/quizzes/q-art/attempts",
        json={"answers": [{"question_id": "qq-1", "answer": "Red"}]},
    )

    assert res.status_code == 403
    # And nothing was recorded against the student.
    assert fake_db.store.get("quiz_attempts", []) == []


def test_unfiltered_quiz_list_excludes_unassigned_subjects(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/quizzes")

    assert res.status_code == 200
    assert [q["id"] for q in res.json()] == ["q-maths"]


def test_child_quiz_list_rejects_unassigned_subject_filter(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/quizzes?subject_id=s-art")

    assert res.status_code == 403
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_subject_access.py -k quiz -v
```

Expected: all four FAIL — 200s where 403s are wanted, and the unfiltered list returns both quizzes.

- [ ] **Step 3: Gate the three endpoints**

In `app/backend/app/routers/quizzes.py`, add below the existing imports:

```python
from app.services.subject_access import allowed_subject_ids, assert_subject_allowed
```

In `list_quizzes`, insert the assert immediately after `client = get_service_client()` and the child filter immediately after the rows are fetched, so it runs before the admin `attempt_count` block:

```python
@router.get("")
def list_quizzes(subject_id: str | None = None, user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    assert_subject_allowed(client, user, subject_id)

    query = client.table("quizzes").select("*").order("created_at", desc=True)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    quizzes = query.execute().data or []

    if user.role == "child" and not subject_id:
        allowed = allowed_subject_ids(client, user.id)
        quizzes = [q for q in quizzes if q["subject_id"] in allowed]
```

Leave the rest of `list_quizzes` (the `if user.role == "admin"` attempt-count block and the `return quizzes`) exactly as it is.

In `get_quiz`, add one line after the 404 guard, before the questions are fetched:

```python
    quiz = client.table("quizzes").select("*").eq("id", quiz_id).single().execute().data
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    assert_subject_allowed(client, user, quiz.get("subject_id"))
```

In `submit_attempt`, add a subject check before the questions are loaded. Replace:

```python
@router.post("/{quiz_id}/attempts", status_code=201)
def submit_attempt(quiz_id: str, body: SubmitAttemptRequest, user: CurrentUser = Depends(require_child)):
    client = get_service_client()
    questions = client.table("quiz_questions").select("*").eq("quiz_id", quiz_id).execute().data
    if not questions:
        raise HTTPException(status_code=404, detail="Quiz not found")
```

with:

```python
@router.post("/{quiz_id}/attempts", status_code=201)
def submit_attempt(quiz_id: str, body: SubmitAttemptRequest, user: CurrentUser = Depends(require_child)):
    client = get_service_client()

    # Check the subject before doing any work: an attempt on a subject the
    # student does not take would pollute their score history and the
    # predictor's features.
    quiz = client.table("quizzes").select("subject_id").eq("id", quiz_id).maybe_single().execute().data
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    assert_subject_allowed(client, user, quiz.get("subject_id"))

    questions = client.table("quiz_questions").select("*").eq("quiz_id", quiz_id).execute().data
    if not questions:
        raise HTTPException(status_code=404, detail="Quiz not found")
```

- [ ] **Step 4: Run the full suite**

```bash
pytest -q
```

Expected: all pass, 17 in `test_subject_access.py`. If `test_quiz_grading.py` now fails, its fixtures create quiz rows without a `subject_id` — add `"subject_id": None` to those quiz rows; `assert_subject_allowed` returns early on `None`.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/backend/app/routers/quizzes.py app/backend/tests/test_subject_access.py
git commit -m "feat(api): gate quiz list, detail and attempts by the child's subjects"
```

---

## Task 6: Admin assignment endpoints

**Files:**
- Modify: `app/backend/app/routers/students.py` (append after the notes endpoints)
- Modify: `app/backend/tests/test_subject_access.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `app/backend/tests/test_subject_access.py`:

```python
def _seed_children(fake_db: FakeSupabase) -> None:
    _seed(fake_db)
    fake_db.store["profiles"] = [
        {"id": "child-1", "role": "child", "full_name": "Nimal", "email": "n@x.io"},
        {"id": "parent-1", "role": "parent", "full_name": "Parent", "email": "p@x.io"},
    ]


def test_get_student_subjects_splits_core_and_optional(client, fake_db):
    _seed_children(fake_db)

    res = client.get("/admin/students/child-1/subjects")

    assert res.status_code == 200
    body = res.json()
    assert {s["id"] for s in body["core"]} == {"s-maths", "s-science"}
    assert {s["id"] for s in body["optional"]} == {"s-ict", "s-art"}
    assert body["assigned_ids"] == ["s-ict"]


def test_put_replaces_the_whole_assigned_set(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-art"]})

    assert res.status_code == 200
    assert res.json()["assigned_ids"] == ["s-art"]
    rows = fake_db.store["child_subjects"]
    assert [r["subject_id"] for r in rows] == ["s-art"]
    assert rows[0]["assigned_by"] == "admin-1"


def test_put_can_clear_every_assignment(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": []})

    assert res.status_code == 200
    assert fake_db.store["child_subjects"] == []


def test_put_rejects_an_unknown_subject_id(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-nope"]})

    assert res.status_code == 400


def test_put_rejects_a_core_subject(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-maths"]})

    assert res.status_code == 400


def test_put_rejects_duplicate_ids(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-art", "s-art"]})

    assert res.status_code == 400


def test_put_rejects_a_non_child_profile(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/parent-1/subjects", json={"subject_ids": ["s-art"]})

    assert res.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_subject_access.py -k "student_subjects or put_" -v
```

Expected: all FAIL with 405 Method Not Allowed or 404 — the routes do not exist yet.

- [ ] **Step 3: Add the endpoints**

In `app/backend/app/routers/students.py`, add the request model beside the existing `NoteRequest`:

```python
class AssignSubjectsRequest(BaseModel):
    subject_ids: list[str]
```

Then append both endpoints at the end of the file. (`/{child_id}/subjects` has an extra path segment, so unlike `/roster` it cannot be shadowed by `/{child_id}` and may be declared last.)

```python
@router.get("/{child_id}/subjects")
def get_student_subjects(child_id: str, _: CurrentUser = Depends(require_admin)):
    """Everything the admin UI needs: the automatic core list, the optional
    subjects on offer, and which of those this student is assigned."""
    client = get_service_client()
    _get_child_or_404(client, child_id)

    subjects = client.table("subjects").select("*").order("name").execute().data or []
    assigned = (
        client.table("child_subjects")
        .select("subject_id")
        .eq("child_id", child_id)
        .execute()
        .data
        or []
    )
    return {
        "core": [s for s in subjects if s["is_core"]],
        "optional": [s for s in subjects if not s["is_core"]],
        "assigned_ids": [a["subject_id"] for a in assigned],
    }


@router.put("/{child_id}/subjects")
def set_student_subjects(
    child_id: str,
    body: AssignSubjectsRequest,
    admin: CurrentUser = Depends(require_admin),
):
    """Replace this student's optional subjects with exactly the ids supplied.

    Replace-semantics (rather than add/remove endpoints) matches the admin
    checkbox form, which saves the whole set in one request.
    """
    client = get_service_client()
    _get_child_or_404(client, child_id)

    ids = body.subject_ids
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Duplicate subject ids in request")

    if ids:
        found = client.table("subjects").select("id, is_core").in_("id", ids).execute().data or []
        by_id = {s["id"]: s for s in found}
        missing = [i for i in ids if i not in by_id]
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown subject ids: {missing}")
        if any(by_id[i]["is_core"] for i in ids):
            raise HTTPException(
                status_code=400,
                detail="Core subjects are automatic for every student and cannot be assigned",
            )

    client.table("child_subjects").delete().eq("child_id", child_id).execute()
    if ids:
        client.table("child_subjects").insert(
            [
                {"child_id": child_id, "subject_id": sid, "assigned_by": admin.id}
                for sid in ids
            ]
        ).execute()
    return {"assigned_ids": ids}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pytest tests/test_subject_access.py -v
```

Expected: 24 passed.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/backend/app/routers/students.py app/backend/tests/test_subject_access.py
git commit -m "feat(api): admin endpoints to read and replace a student's optional subjects"
```

---

## Task 7: Subject create/update with `is_core`

**Files:**
- Modify: `app/backend/app/routers/subjects.py` (`CreateSubjectRequest`, `create_subject`, plus a new `PATCH`)
- Modify: `app/backend/tests/test_subject_access.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `app/backend/tests/test_subject_access.py`:

```python
def test_new_subjects_are_core_by_default(client, fake_db):
    res = client.post("/subjects", json={"name": "History"})

    assert res.status_code == 201
    assert res.json()["is_core"] is True


def test_a_subject_can_be_created_as_optional(client, fake_db):
    res = client.post("/subjects", json={"name": "Music", "is_core": False})

    assert res.status_code == 201
    assert res.json()["is_core"] is False


def test_patch_flips_a_subject_to_optional(client, fake_db):
    _seed(fake_db)

    res = client.patch("/subjects/s-maths", json={"is_core": False})

    assert res.status_code == 200
    assert res.json()["is_core"] is False


def test_flipping_a_subject_to_core_clears_its_assignments(client, fake_db):
    _seed(fake_db)
    assert fake_db.store["child_subjects"]  # s-ict is assigned to child-1

    res = client.patch("/subjects/s-ict", json={"is_core": True})

    assert res.status_code == 200
    # Core is implicit, so keeping the rows would be meaningless — and they
    # would silently reappear if the subject were flipped back to optional.
    assert fake_db.store["child_subjects"] == []


def test_patch_with_no_fields_is_rejected(client, fake_db):
    _seed(fake_db)

    res = client.patch("/subjects/s-maths", json={})

    assert res.status_code == 400


def test_patch_of_a_missing_subject_is_404(client, fake_db):
    _seed(fake_db)

    res = client.patch("/subjects/s-nope", json={"is_core": False})

    assert res.status_code == 404
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pytest tests/test_subject_access.py -k "subjects_are_core or created_as_optional or patch or flipping" -v
```

Expected: the create tests FAIL with `KeyError: 'is_core'`; the PATCH tests FAIL with 405 Method Not Allowed.

- [ ] **Step 3: Extend the router**

In `app/backend/app/routers/subjects.py`, change the import line to include `HTTPException`:

```python
from fastapi import APIRouter, Depends, HTTPException
```

Add `is_core` to the create model and a new update model:

```python
class CreateSubjectRequest(BaseModel):
    name: str
    grade_level: str | None = None
    # Core subjects are taken by every student. Optional (elective) ones are
    # assigned per child by an admin.
    is_core: bool = True


class UpdateSubjectRequest(BaseModel):
    name: str | None = None
    grade_level: str | None = None
    is_core: bool | None = None
```

Update `create_subject` to persist the flag:

```python
@router.post("", status_code=201)
def create_subject(body: CreateSubjectRequest, _: CurrentUser = Depends(require_content_author)):
    client = get_service_client()
    result = (
        client.table("subjects")
        .insert({"name": body.name, "grade_level": body.grade_level, "is_core": body.is_core})
        .execute()
    )
    return result.data[0]
```

Append the new endpoint:

```python
@router.patch("/{subject_id}")
def update_subject(
    subject_id: str,
    body: UpdateSubjectRequest,
    _: CurrentUser = Depends(require_content_author),
):
    """Rename a subject or reclassify it as core/optional.

    exclude_unset (not a None-filter) so grade_level can be explicitly nulled,
    matching PATCH /admin/users/{id}.
    """
    client = get_service_client()
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = client.table("subjects").update(changes).eq("id", subject_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Subject not found")

    # A core subject is implicit for every child, so stored assignments become
    # meaningless — and would silently return if it were flipped optional again.
    if changes.get("is_core") is True:
        client.table("child_subjects").delete().eq("subject_id", subject_id).execute()

    return result.data[0]
```

- [ ] **Step 4: Run the full suite**

```bash
pytest -q
```

Expected: all pass, 30 in `test_subject_access.py`.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/backend/app/routers/subjects.py app/backend/tests/test_subject_access.py
git commit -m "feat(api): classify subjects as core or optional on create and update"
```

---

## Task 8: Frontend types and `apiPut`

**Files:**
- Modify: `app/frontend/src/lib/api.ts` (after `apiPatch`, ~line 42)
- Modify: `app/frontend/src/lib/types.ts:20-25` (`Subject`)

All frontend commands run from `app/frontend`:

```bash
cd "d:/Business/Research - FYP/client01/app/frontend"
```

There is no frontend test runner in this project — `tsc -b` is the verification step, as documented in `SETUP_GUIDE.md` §9.

- [ ] **Step 1: Add `apiPut`**

In `app/frontend/src/lib/api.ts`, insert after `apiPatch` and before `apiDelete`:

```ts
export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return handle<T>(res)
}
```

- [ ] **Step 2: Extend the types**

In `app/frontend/src/lib/types.ts`, replace:

```ts
export interface Subject {
  id: string
  name: string
  grade_level: string | null
  created_at: string
}
```

with:

```ts
export interface Subject {
  id: string
  name: string
  grade_level: string | null
  // Core subjects are taken by every student; optional ones are assigned
  // per child by an admin.
  is_core: boolean
  created_at: string
}

/** Response of GET /admin/students/{id}/subjects. */
export interface StudentSubjects {
  core: Subject[]
  optional: Subject[]
  assigned_ids: string[]
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc -b
```

Expected: no output (success). If it reports errors about `is_core` missing from an object literal, a component builds a `Subject` by hand — add `is_core: true` there.

- [ ] **Step 4: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/frontend/src/lib/api.ts app/frontend/src/lib/types.ts
git commit -m "feat(web): add apiPut and optional-subject types"
```

---

## Task 9: The admin assignment card

**Files:**
- Create: `app/frontend/src/components/admin/OptionalSubjectsCard.tsx`
- Modify: `app/frontend/src/pages/admin/StudentDetail.tsx` (import + mount)

- [ ] **Step 1: Write the component**

Create `app/frontend/src/components/admin/OptionalSubjectsCard.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Alert'
import { Spinner } from '../ui/Spinner'
import { EmptyState } from '../ui/EmptyState'
import { apiGet, apiPut } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import type { StudentSubjects } from '../../lib/types'

// Which optional (elective) subjects this student takes. Core subjects are
// automatic for every student, so they are shown read-only for context.
export function OptionalSubjectsCard({ childId }: { childId: string }) {
  const [data, setData] = useState<StudentSubjects | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let active = true
    apiGet<StudentSubjects>(`/admin/students/${childId}/subjects`)
      .then((res) => {
        if (!active) return
        setData(res)
        setSelected(new Set(res.assigned_ids))
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load subjects')
      })
    return () => {
      active = false
    }
  }, [childId])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const res = await apiPut<{ assigned_ids: string[] }>(
        `/admin/students/${childId}/subjects`,
        { subject_ids: [...selected] },
      )
      setSelected(new Set(res.assigned_ids))
      toast('Optional subjects saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subjects')
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    !!data &&
    (selected.size !== data.assigned_ids.length ||
      data.assigned_ids.some((id) => !selected.has(id)))

  return (
    <Card
      title="Optional subjects"
      description="Core subjects are automatic — choose only this student's electives"
    >
      {error && <Alert>{error}</Alert>}

      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-2 text-slate-500 dark:text-slate-400">Core — every student</p>
            <div className="flex flex-wrap gap-1.5">
              {data.core.length === 0 ? (
                <span className="text-sm text-slate-400 dark:text-slate-500">None yet</span>
              ) : (
                data.core.map((s) => <Badge key={s.id}>{s.name}</Badge>)
              )}
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2 text-slate-500 dark:text-slate-400">Optional — this student</p>
            {data.optional.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No optional subjects yet"
                description="Mark a subject as optional in Materials to offer it here."
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.optional.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-indigo-600 dark:accent-indigo-400"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.optional.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={save} loading={saving} disabled={!dirty}>
                Save subjects
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
```

- [ ] **Step 2: Mount it on the student detail page**

In `app/frontend/src/pages/admin/StudentDetail.tsx`, add to the imports:

```tsx
import { OptionalSubjectsCard } from '../../components/admin/OptionalSubjectsCard'
```

Then place the card immediately after the "Performance risk" `</Card>` and before the `<Card title="Academic records"` block:

```tsx
        {/* Optional subjects */}
        {id && <OptionalSubjectsCard childId={id} />}
```

`id` comes from the existing `useParams<{ id: string }>()` at the top of the component and is typed `string | undefined`, hence the guard.

- [ ] **Step 3: Typecheck**

```bash
cd "d:/Business/Research - FYP/client01/app/frontend"
npx tsc -b
```

Expected: no output. If `useToast` is reported as not callable, open `src/contexts/ToastContext.tsx` and match the call shape used in `StudentDetail.tsx` (it already calls `toast(...)`).

- [ ] **Step 4: Verify in the browser**

Start both servers (backend on **8001**), log in as admin, open a child from the Users list, and confirm: core subjects appear as read-only badges, optional subjects as checkboxes, Save is disabled until something changes, and the selection survives a page reload.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/frontend/src/components/admin/OptionalSubjectsCard.tsx app/frontend/src/pages/admin/StudentDetail.tsx
git commit -m "feat(web): assign a student's optional subjects from their detail page"
```

---

## Task 10: Classify subjects in ContentManager

**Files:**
- Modify: `app/frontend/src/pages/admin/ContentManager.tsx` (`CreateSubjectModal` at ~line 574, and the subject `<Select>` at ~line 142)

- [ ] **Step 1: Add the core/optional choice to the create modal**

In `CreateSubjectModal`, add state beside the existing fields:

```tsx
  const [isCore, setIsCore] = useState(true)
```

Send it on submit — replace the `apiPost` call:

```tsx
      const s = await apiPost<Subject>('/subjects', { name, grade_level: gradeLevel || null })
```

with:

```tsx
      const s = await apiPost<Subject>('/subjects', {
        name,
        grade_level: gradeLevel || null,
        is_core: isCore,
      })
```

and reset it alongside the other fields:

```tsx
      setName('')
      setGradeLevel('')
      setIsCore(true)
```

Then add the control after the "Grade level (optional)" `</Field>`:

```tsx
        <Field label="Type">
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="radio"
                name="subject-type"
                className="mt-0.5 size-4 shrink-0 accent-indigo-600 dark:accent-indigo-400"
                checked={isCore}
                onChange={() => setIsCore(true)}
              />
              <span>
                Core
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Every student takes it — no assignment needed
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="radio"
                name="subject-type"
                className="mt-0.5 size-4 shrink-0 accent-indigo-600 dark:accent-indigo-400"
                checked={!isCore}
                onChange={() => setIsCore(false)}
              />
              <span>
                Optional
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  Assigned per student on their detail page
                </span>
              </span>
            </label>
          </div>
        </Field>
```

- [ ] **Step 2: Show which type each subject is**

In the subject `<Select>` around line 142, replace the option label so the type is visible while choosing:

```tsx
                {subjects.map((s) => (
```

The existing `<option>` inside that map renders `{s.name}`. Change it to:

```tsx
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_core ? '' : ' (optional)'}
                  </option>
```

Keep the surrounding `map` and `key` exactly as they are — only the label text changes. A native `<option>` cannot contain a `Badge`, which is why this is a text suffix rather than a pill.

- [ ] **Step 3: Typecheck and build**

```bash
cd "d:/Business/Research - FYP/client01/app/frontend"
npx tsc -b
npm run build
```

Expected: `tsc` silent; the build ends with `✓ built in …` and only the pre-existing 1 MB chunk-size warning. If the build fails with `EPERM … dist\index.html`, close anything holding `dist/` (e.g. `npm run preview`) or delete the folder and retry.

- [ ] **Step 4: Verify in the browser**

As admin → Materials: create a subject as Optional, confirm it shows "(optional)" in the picker, then open a student and confirm the new subject appears as a checkbox in the Optional subjects card.

- [ ] **Step 5: Commit**

```bash
cd "d:/Business/Research - FYP/client01"
git add app/frontend/src/pages/admin/ContentManager.tsx
git commit -m "feat(web): choose core or optional when creating a subject"
```

---

## Task 11: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

```bash
cd "d:/Business/Research - FYP/client01/app/backend"
.venv\Scripts\Activate.ps1
pytest -q
```

Expected: every test passes, including the pre-existing `test_engagement.py` and `test_quiz_grading.py`.

- [ ] **Step 2: Full frontend build**

```bash
cd "d:/Business/Research - FYP/client01/app/frontend"
npm run build
```

Expected: `tsc -b` silent, build succeeds.

- [ ] **Step 3: Walk the feature as all three roles**

With both servers running (backend on port 8001):

1. **Admin** → Materials: mark one existing subject Optional via a newly created optional subject, and upload a material plus build a quiz under it.
2. **Admin** → Users → open a child → Optional subjects: tick that subject, Save.
3. **Child** (separate browser or incognito): the subject appears; its materials and quizzes load.
4. **Admin**: untick the subject and Save.
5. **Child**: reload — the subject is gone.
6. Confirm the gate is real rather than cosmetic. Copy the subject's id from the
   admin URL bar or the Materials picker, then paste this into the **child's**
   DevTools console (top-level `await` works there), replacing the id:

   ```js
   const key = Object.keys(localStorage).find((k) => k.startsWith('sb-'))
   const token = JSON.parse(localStorage[key]).access_token
   const res = await fetch('http://localhost:8001/materials?subject_id=PASTE_SUBJECT_ID_HERE', {
     headers: { Authorization: 'Bearer ' + token },
   })
   console.log(res.status, await res.json())
   ```

   Expected: `403 {detail: 'This subject is not one of yours.'}`. A `200` means
   the endpoint was missed — recheck Task 4.
7. **Parent** of that child: their dashboard still loads normally — nothing in the parent portal changed.

- [ ] **Step 4: Update the progress log**

Append this entry to `client01/plans/Progress_Log.md`, adjusting the test count to
what `pytest -q` actually reported:

```markdown
## 2026-07-30 — Per-student optional subjects

O/L students take ~6 core subjects plus their own electives, so subjects are no
longer uniform across students. `subjects` gained `is_core` (default **true**, so
the migration left every existing subject visible to everyone) and a new
`child_subjects` join table holds each student's optional picks.

Enforcement is server-side in `app/services/subject_access.py` — one resolver
(`allowed_subject_ids` = core ∪ assigned) called from `GET /subjects`, the
material list/download, and the quiz list/detail/attempt endpoints. Two of those
had no subject check at all before: `GET /materials/{id}/download` and
`POST /quizzes/{id}/attempts`, the latter mattering because an attempt on a
non-assigned subject would have polluted the student's score history and the
predictor's features. Admins and parents are never filtered.

Admin UI: a new `OptionalSubjectsCard` on `/admin/students/:id` (core shown
read-only, optionals as checkboxes, one PUT replaces the whole set), plus a
Core/Optional choice when creating a subject in ContentManager.

Design: `plans/2026-07-30-optional-subjects-design.md` ·
Plan: `plans/2026-07-30-optional-subjects-plan.md`
Verified: backend `pytest -q` green, `npm run build` clean, walked as
admin/child/parent with a 403 confirmed from the child's own session.
```

- [ ] **Step 5: Commit and merge**

```bash
cd "d:/Business/Research - FYP/client01"
git add plans/Progress_Log.md
git commit -m "docs: log per-student optional subjects"
git checkout main
git merge --no-ff feat/optional-subjects
```

---

## Notes on things deliberately not built

From the design doc's out-of-scope list — do not add these without a new decision:

- Basket rules ("exactly one subject per basket 1–3")
- Parent-dashboard or admin-analytics subject scoping
- Optional-subject assignment in `app/backend/app/scripts/seed_demo.py`
- Any change to the engagement scorer or the risk predictor
