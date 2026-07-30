# Phase 6 — Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three missing Phase 6 dashboard pieces — an admin risk-sorted class roster, an admin student-detail page with private intervention notes, and a parent engagement trend chart — plus a support-not-blame copy pass and browser verification.

**Architecture:** Follows the existing project shape exactly. New backend endpoints live in FastAPI routers using `get_service_client()` + `require_role` (the RLS-vs-API golden rule — all reads/writes go through the service-role key, never client RLS). A new `students.py` router groups the admin roster/detail/notes endpoints (keeping `admin.py` focused on user/link management). Frontend reuses the existing `TrendChart`, `RISK_META`, `Card`, `Badge`, `EmptyState`, and `apiGet/apiPost` primitives. One new table, `intervention_notes`, is additive to the schema.

**Tech Stack:** FastAPI + supabase-py (backend), React 19 + react-router 7 + Recharts + Tailwind (frontend), Supabase Postgres.

**Verification note (project-specific):** This repo has **no automated test framework** and is **not a git repo**. Its established verification pattern is: backend = Python import/route-registration check + manual endpoint exercise against live Supabase; frontend = `tsc --noEmit`; final = in-browser click-through at `localhost:5173`. This plan's "verify" steps use that pattern (there is no pytest/vitest to write, and no `git commit` step). Each task ends with a **checkpoint** instead of a commit.

**Backend run commands** (from `app/backend/`, with the project `.venv` active):
- Route-registration check: `python -c "from app.main import app; print([r.path for r in app.routes])"`
- Dev server: `uvicorn app.main:app --reload`

**Frontend run commands** (from `app/frontend/`):
- Typecheck: `npx tsc --noEmit`
- Dev server: `npm run dev` (serves `localhost:5173`)

---

## File Structure

**Backend (`app/backend/app/`):**
- Create: `routers/students.py` — admin roster, student detail, intervention notes (one responsibility: admin's student-centric views).
- Modify: `routers/engagement.py` — add the engagement-history endpoint.
- Modify: `main.py` — register the new `students` router.

**Schema (`app/supabase/`):**
- Modify: `schema.sql` — add the `intervention_notes` table + enable RLS.

**Frontend (`app/frontend/src/`):**
- Modify: `lib/types.ts` — add `RosterRow`, `AcademicRecord`, `StudentDetail`, `InterventionNote`, `EngagementPoint`.
- Modify: `pages/parent/Dashboard.tsx` — fetch + render the engagement trend on the Overview.
- Modify: `pages/admin/Dashboard.tsx` — refactor `RiskSection` to use the roster endpoint (server-sorted, clickable rows).
- Create: `pages/admin/StudentDetail.tsx` — the `/admin/students/:id` page.
- Modify: `App.tsx` — add the `/admin/students/:id` route.

---

## Task 1: Schema — `intervention_notes` table

**Files:**
- Modify: `app/supabase/schema.sql` (after the `messages` table block, ~line 172, and add the RLS enable near the other `alter table ... enable row level security` lines ~194)

- [ ] **Step 1: Add the table definition**

In `schema.sql`, after the `messages` table (the `-- ========== MESSAGES ==========` block ending ~line 172), add:

```sql
-- ========== INTERVENTION NOTES (admin-only staff case log) ==========
create table intervention_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references profiles(id),
  author_id uuid not null references profiles(id),   -- the admin who wrote it
  body text not null,
  created_at timestamptz default now()
);
create index intervention_notes_child_idx on intervention_notes(child_id);
```

- [ ] **Step 2: Enable RLS (deny-all to clients; API uses the service-role key)**

In the RLS section, alongside the other `alter table ... enable row level security;` lines (~line 197, after `alter table messages ...`), add:

```sql
alter table intervention_notes enable row level security;
```

Do NOT add any client `select`/`insert` policy — like `predictions` and `messages`, all access goes through the API with the service-role key (RLS-vs-API golden rule). RLS-enabled with no policy = no direct client access, which is intended.

- [ ] **Step 3: Create the table on the live Supabase DB**

Run the two `create table`/`alter table` statements above against the live project (via the Supabase SQL editor, or `psql` with the project connection string). This is additive — no existing table changes.

- [ ] **Step 4: Verify the table exists**

Run (SQL editor or psql):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'intervention_notes' order by ordinal_position;
```

Expected: rows for `id, child_id, author_id, body, created_at`.

- [ ] **Step 5: Checkpoint** — table created + verified; `schema.sql` updated.

---

## Task 2: Backend — admin students router (roster + detail)

**Files:**
- Create: `app/backend/app/routers/students.py`
- Modify: `app/backend/app/main.py`

- [ ] **Step 1: Create the router with the roster and detail endpoints**

Create `app/backend/app/routers/students.py`:

```python
"""Admin student-centric views: the risk-sorted roster and the per-student
detail aggregate + intervention notes. Admin-only; all access via the
service-role client (RLS-vs-API golden rule)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/admin/students", tags=["students"])

require_admin = require_role("admin")

# High surfaces first — at-risk students go to the top of the roster.
_BAND_ORDER = {"high": 0, "medium": 1, "low": 2}


class NoteRequest(BaseModel):
    body: str


# NOTE: /roster MUST be declared before /{child_id} — FastAPI matches routes in
# declaration order, so a literal path has to precede the parameterised one or
# GET /admin/students/roster would bind child_id="roster".
@router.get("/roster")
def student_roster(_: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    children = (
        client.table("profiles")
        .select("id, full_name, grade_level")
        .eq("role", "child")
        .execute()
        .data
    )
    rows = []
    for c in children:
        pred = (
            client.table("predictions")
            .select("risk_band, risk_score, generated_at")
            .eq("child_id", c["id"])
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        act = (
            client.table("student_activity")
            .select("created_at")
            .eq("child_id", c["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        p = pred[0] if pred else None
        rows.append(
            {
                "child_id": c["id"],
                "full_name": c["full_name"],
                "grade_level": c["grade_level"],
                "risk_band": p["risk_band"] if p else None,
                "risk_score": p["risk_score"] if p else None,
                "generated_at": p["generated_at"] if p else None,
                "last_activity_at": act[0]["created_at"] if act else None,
            }
        )
    # Sort by band (high->medium->low; unpredicted last), then risk_score desc.
    rows.sort(key=lambda r: (_BAND_ORDER.get(r["risk_band"], 3), -(r["risk_score"] or 0)))
    return rows


@router.get("/{child_id}")
def student_detail(child_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    profile = client.table("profiles").select("*").eq("id", child_id).single().execute().data
    if not profile or profile["role"] != "child":
        raise HTTPException(status_code=404, detail="Child not found")

    academics = (
        client.table("academic_records")
        .select("*")
        .eq("child_id", child_id)
        .order("term")
        .execute()
        .data
    )
    activity = (
        client.table("student_activity")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
        .data
    )
    attempts = (
        client.table("quiz_attempts")
        .select("*")
        .eq("child_id", child_id)
        .order("submitted_at", desc=True)
        .execute()
        .data
    )
    return {"profile": profile, "academics": academics, "activity": activity, "attempts": attempts}
```

- [ ] **Step 2: Register the router in `main.py`**

In `app/backend/app/main.py`, add `students` to the router import block (line 5) and add an `include_router` line after `engagement.router` (line 37):

```python
from app.routers import (
    activity,
    admin,
    engagement,
    health,
    materials,
    parent,
    predictions,
    profiles,
    quizzes,
    students,
    subjects,
)
```

```python
app.include_router(students.router)
```

(Keep the existing alphabetical-ish grouping; the exact import list above shows the full set — match the existing names already present.)

- [ ] **Step 3: Verify routes register**

Run: `python -c "from app.main import app; print([r.path for r in app.routes])"`
Expected: the list includes `/admin/students/roster` and `/admin/students/{child_id}`.

- [ ] **Step 4: Verify roster ordering against live data**

With the dev server running (`uvicorn app.main:app --reload`) and an admin token, GET `/admin/students/roster`.
Expected: a JSON array; any `risk_band: "high"` rows appear before `"medium"` before `"low"`, and rows with `risk_band: null` appear last.

- [ ] **Step 5: Checkpoint** — roster + detail endpoints live and ordered correctly.

---

## Task 3: Backend — intervention notes endpoints

**Files:**
- Modify: `app/backend/app/routers/students.py`

- [ ] **Step 1: Add the notes endpoints**

Append to `students.py` (after `student_detail`):

```python
@router.get("/{child_id}/notes")
def list_notes(child_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    notes = (
        client.table("intervention_notes")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    author_ids = list({n["author_id"] for n in notes})
    names: dict[str, str | None] = {}
    if author_ids:
        authors = (
            client.table("profiles").select("id, full_name").in_("id", author_ids).execute().data
        )
        names = {a["id"]: a["full_name"] for a in authors}
    for n in notes:
        n["author_name"] = names.get(n["author_id"])
    return notes


@router.post("/{child_id}/notes", status_code=status.HTTP_201_CREATED)
def create_note(child_id: str, body: NoteRequest, admin: CurrentUser = Depends(require_admin)):
    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note body cannot be empty")
    client = get_service_client()
    result = (
        client.table("intervention_notes")
        .insert({"child_id": child_id, "author_id": admin.id, "body": text})
        .execute()
    )
    return result.data[0]
```

Note: `author_id` is taken from the authenticated admin (`admin.id`), never from the request body — the client cannot forge authorship. The POST returns the raw inserted row; the frontend reloads the list after posting (existing create-then-reload pattern), so no author-name join is needed on POST.

- [ ] **Step 2: Verify routes register**

Run: `python -c "from app.main import app; print([r.path for r in app.routes])"`
Expected: includes `/admin/students/{child_id}/notes`.

- [ ] **Step 3: Verify create + list against live data**

With an admin token and a real child_id: POST `/admin/students/{child_id}/notes` with `{"body": "Test note"}` → expect 201 + a row with `author_id` = the admin's id. Then GET `/admin/students/{child_id}/notes` → expect the note, newest first, with `author_name` populated. POST with `{"body": "   "}` → expect 400.

- [ ] **Step 4: Clean up the test note** — delete the test row (SQL editor: `delete from intervention_notes where body = 'Test note';`). Real project — don't leave test rows.

- [ ] **Step 5: Checkpoint** — notes endpoints working, test data removed.

---

## Task 4: Backend — engagement history endpoint

**Files:**
- Modify: `app/backend/app/routers/engagement.py`

- [ ] **Step 1: Add the history endpoint**

Append to `engagement.py` (after `get_engagement`, reusing the existing `_assert_access` + `require_parent_or_admin` in that file):

```python
@router.get("/{child_id}/history")
def get_engagement_history(child_id: str, user: CurrentUser = Depends(require_parent_or_admin)):
    client = get_service_client()
    _assert_access(client, user, child_id)
    rows = (
        client.table("engagement_index")
        .select("period, engagement_index, computed_at")
        .eq("child_id", child_id)
        .order("computed_at", desc=False)  # oldest -> newest for a left-to-right trend
        .execute()
        .data
    )
    return rows
```

`/{child_id}/history` and `/{child_id}` are distinct path depths, so declaration order between them doesn't matter. Authorization reuses the same linked-child guard as `get_engagement` (parent must be linked; admin sees any) — a parent cannot read another family's trend.

- [ ] **Step 2: Verify route registers**

Run: `python -c "from app.main import app; print([r.path for r in app.routes])"`
Expected: includes `/engagement/{child_id}/history`.

- [ ] **Step 3: Verify against live data**

With a parent token linked to a child: GET `/engagement/{child_id}/history` → expect an array (possibly empty) of `{period, engagement_index, computed_at}` in ascending `computed_at`. With a parent NOT linked to the child → expect 403.

- [ ] **Step 4: Checkpoint** — history endpoint live and authorization-gated.

---

## Task 5: Frontend — types

**Files:**
- Modify: `app/frontend/src/lib/types.ts`

- [ ] **Step 1: Add the new interfaces**

Append to `types.ts`:

```typescript
// Row from GET /admin/students/roster — one child + latest prediction summary.
export interface RosterRow {
  child_id: string
  full_name: string | null
  grade_level: string | null
  risk_band: RiskBand | null
  risk_score: number | null
  generated_at: string | null
  last_activity_at: string | null
}

// Row from academic_records (surfaced in the student detail page).
export interface AcademicRecord {
  id: string
  child_id: string
  subject_id: string | null
  term: string | null
  assessment_score: number | null
  exam_score: number | null
  attendance_pct: number | null
  created_at: string
}

// Response from GET /admin/students/{id}.
export interface StudentDetail {
  profile: Profile
  academics: AcademicRecord[]
  activity: StudentActivity[]
  attempts: QuizAttempt[]
}

// Row from GET/POST /admin/students/{id}/notes.
export interface InterventionNote {
  id: string
  child_id: string
  author_id: string
  body: string
  created_at: string
  author_name?: string | null
}

// Point from GET /engagement/{child_id}/history.
export interface EngagementPoint {
  period: string | null
  engagement_index: number | null
  computed_at: string | null
}
```

- [ ] **Step 2: Verify typecheck**

Run (from `app/frontend/`): `npx tsc --noEmit`
Expected: no errors (new types are unused so far — that's fine).

- [ ] **Step 3: Checkpoint** — types added, typecheck clean.

---

## Task 6: Frontend — parent engagement trend

**Files:**
- Modify: `app/frontend/src/pages/parent/Dashboard.tsx`

- [ ] **Step 1: Add the history import and state**

In `pages/parent/Dashboard.tsx`, add `EngagementPoint` to the type import (the `import type { ... }` block around line 33-42) and `TrendPoint` is already available via `TrendChart`. Add state next to the existing `engagement` state (~line 68):

```typescript
const [engagementHistory, setEngagementHistory] = useState<EngagementPoint[]>([])
```

- [ ] **Step 2: Fetch history alongside the current engagement**

In the effect that fetches prediction/engagement for the selected child (the block at ~line 136-143 with `apiGet<EngagementIndex>(...)`), add a best-effort history fetch, and reset it when the child changes (near the `setEngagement(null)` reset ~line 127):

```typescript
// reset block (near setPrediction(null); setEngagement(null))
setEngagementHistory([])
```

```typescript
// fetch block (after the existing apiGet<EngagementIndex> call)
apiGet<EngagementPoint[]>(`/engagement/${childId}/history`)
  .then(setEngagementHistory)
  .catch(() => setEngagementHistory([]))
```

- [ ] **Step 3: Pass history into the Overview + Engagement card**

Update the `<OverviewSection ... />` usage (~line 195) to pass `engagementHistory={engagementHistory}`, add it to `OverviewSection`'s props type and destructuring (~line 213-225), and pass it into `<EngagementCard ... />` (~line 256) as `history={engagementHistory}`.

```tsx
// OverviewSection props additions
engagementHistory: EngagementPoint[]
```

- [ ] **Step 4: Render the trend inside EngagementCard**

In `EngagementCard` (starts ~line 328), change its signature to accept `history` and render a `TrendChart` below the existing PEI meter. Map points to `TrendPoint` (value as 0–100 percent). Only render the chart when there are ≥2 points; otherwise a small "not enough history" line.

```tsx
function EngagementCard({
  engagement,
  history,
}: {
  engagement: EngagementIndex | null
  history: EngagementPoint[]
}) {
  const pei = engagement?.engagement_index
  const pct = pei != null ? Math.round(pei * 100) : null

  const trend = history
    .filter((h) => h.engagement_index != null)
    .map((h) => ({
      label: h.period ?? (h.computed_at ? new Date(h.computed_at).toLocaleDateString() : ''),
      value: Math.round((h.engagement_index ?? 0) * 100),
    }))

  return (
    // ... keep the existing card header + PEI meter + component breakdown ...
    // then, before the closing </Card>, add the trend block:
    <>
      {/* existing card body unchanged */}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          Engagement over time
        </p>
        {trend.length >= 2 ? (
          <TrendChart data={trend} mode="line" height={180} yDomain={[0, 100]} valueFormatter={(v) => `${v}%`} />
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">Not enough history yet — the trend appears after a few monitoring periods.</p>
        )}
      </div>
    </>
  )
}
```

Note: preserve the existing `EngagementCard` body (header, PEI meter, formula/component breakdown) exactly — only add the trend block and the `history` prop. Read the current card body (lines ~328-400) before editing and keep it intact.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Checkpoint** — parent Overview compiles with the trend wired in (visual check happens in Task 10).

---

## Task 7: Frontend — admin risk roster (server-sorted, clickable)

**Files:**
- Modify: `app/frontend/src/pages/admin/Dashboard.tsx`

- [ ] **Step 1: Add imports**

At the top of `pages/admin/Dashboard.tsx`, add `useNavigate` from `react-router-dom` and `RosterRow` to the types import. `apiGet`, `apiPost`, `Card`, `Button`, `EmptyState`, `Avatar`, `Badge`, `RISK_META`, `ShieldAlert`, `RefreshCw` are already imported (used by the current `RiskSection`).

```typescript
import { useNavigate } from 'react-router-dom'
```

- [ ] **Step 2: Replace the RiskSection data source with the roster endpoint**

Rewrite `RiskSection` (currently ~line 583-694) to load the server-sorted roster in one call instead of N per-child `/predictions/{id}` calls, and make each row navigate to the detail page. Keep the "Run predictions" button and the "Model health" card.

```tsx
function RiskSection() {
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [meta, setMeta] = useState<PredictionRunResult['metrics'] | null>(null)
  const toast = useToast()
  const navigate = useNavigate()

  async function loadRoster() {
    setLoading(true)
    try {
      setRoster(await apiGet<RosterRow[]>('/admin/students/roster'))
    } catch {
      setRoster([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoster()
  }, [])

  async function runBatch() {
    setRunning(true)
    try {
      const result = await apiPost<PredictionRunResult>('/predictions/run', {})
      setMeta(result.metrics)
      toast.success(`Predicted ${result.predicted} child account(s) · model ${result.model_version}`)
      await loadRoster()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run predictions')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Performance-risk roster"
        description={`${roster.length} child account(s) — highest risk first · Random Forest, explainable`}
        actions={
          <Button icon={<RefreshCw className={`size-4 ${running ? 'animate-spin' : ''}`} />} onClick={runBatch} loading={running}>
            Run predictions
          </Button>
        }
      >
        {roster.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No child accounts" description="Create child accounts to generate predictions." />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead className="text-slate-500 dark:text-slate-400 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">Child</th>
                  <th className="px-5 py-2 font-medium">Risk band</th>
                  <th className="px-5 py-2 font-medium">Confidence</th>
                  <th className="px-5 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {roster.map((r) => (
                  <tr
                    key={r.child_id}
                    onClick={() => navigate(`/admin/students/${r.child_id}`)}
                    className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.full_name ?? '—'} size="sm" />
                        <div>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{r.full_name ?? '—'}</span>
                          {r.grade_level && <span className="ml-2 text-xs text-slate-400">{r.grade_level}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      {r.risk_band ? <Badge tone={RISK_META[r.risk_band].tone}>{RISK_META[r.risk_band].label}</Badge> : <span className="text-slate-400">{loading ? '…' : '—'}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">
                      {r.risk_score != null ? `${Math.round(r.risk_score * 100)}%` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-slate-400 dark:text-slate-500">
                      {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {meta && (
        <Card title="Model health" description="Held-out test metrics from the last training run">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(meta).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-400 dark:text-slate-500">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-lg font-semibold text-slate-800 dark:text-slate-200">{typeof v === 'number' ? v.toFixed(3) : v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update the RiskSection call site**

`RiskSection` no longer takes `childAccounts`. Update its usage (~line 142) from `<RiskSection childAccounts={users.filter((u) => u.role === 'child')} />` to `<RiskSection />`. Verify `Prediction` is still imported/used elsewhere in the file; if `RISK_META` was only referenced via the old code, it is still used here so keep the import.

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `tsc` flags an unused `Prediction` import (the old per-child map used it), remove `Prediction` from the import only if nothing else in the file uses it.

- [ ] **Step 5: Checkpoint** — roster loads from the endpoint, sorted, rows navigate. Typecheck clean.

---

## Task 8: Frontend — student detail page

**Files:**
- Create: `app/frontend/src/pages/admin/StudentDetail.tsx`
- Modify: `app/frontend/src/App.tsx`

- [ ] **Step 1: Create the detail page**

Create `pages/admin/StudentDetail.tsx`. It is a focused standalone admin page (not the section-nav dashboard shell) with a back link, using the shared UI primitives. It fetches the detail aggregate, the prediction (reusing the Phase 5 `GET /predictions/{id}`), and the notes; and posts new notes (reload-after-post).

```tsx
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { Alert } from '../../components/ui/Alert'
import { apiGet, apiPost } from '../../lib/api'
import { RISK_META } from '../../lib/risk'
import type { StudentDetail, Prediction, InterventionNote } from '../../lib/types'

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [notes, setNotes] = useState<InterventionNote[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadNotes(childId: string) {
    try {
      setNotes(await apiGet<InterventionNote[]>(`/admin/students/${childId}/notes`))
    } catch {
      setNotes([])
    }
  }

  useEffect(() => {
    if (!id) return
    apiGet<StudentDetail>(`/admin/students/${id}`)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load student'))
    apiGet<Prediction>(`/predictions/${id}`)
      .then(setPrediction)
      .catch(() => setPrediction(null))
    loadNotes(id)
  }, [id])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    if (!id || !noteBody.trim()) return
    setSubmitting(true)
    try {
      await apiPost(`/admin/students/${id}/notes`, { body: noteBody.trim() })
      setNoteBody('')
      await loadNotes(id)
    } catch {
      // best-effort; keep the typed text so nothing is lost
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f4f1] dark:bg-slate-950 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft className="size-4" /> Back to roster
        </button>

        {loadError && <Alert>{loadError}</Alert>}

        {detail && (
          <div className="flex items-center gap-3">
            <Avatar name={detail.profile.full_name} size="lg" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{detail.profile.full_name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {[detail.profile.grade_level, detail.profile.email].filter(Boolean).join(' · ') || 'Student'}
              </p>
            </div>
            {prediction && <div className="ml-auto"><Badge tone={RISK_META[prediction.risk_band].tone}>{RISK_META[prediction.risk_band].label}</Badge></div>}
          </div>
        )}

        {/* Prediction */}
        <Card title="Performance risk" description="Why the model predicts this band">
          {prediction ? (
            <>
              <div className="flex items-center gap-3">
                <Badge tone={RISK_META[prediction.risk_band].tone}>{RISK_META[prediction.risk_band].label}</Badge>
                {prediction.risk_score != null && (
                  <span className="text-sm text-slate-500 dark:text-slate-400">{Math.round(prediction.risk_score * 100)}% confidence</span>
                )}
              </div>
              <ul className="mt-4 space-y-2">
                {(prediction.top_factors ?? []).map((f) => {
                  const Icon = f.direction === 'raises' ? TrendingUp : TrendingDown
                  const tone = f.direction === 'raises' ? 'text-red-500' : 'text-emerald-500'
                  return (
                    <li key={f.feature} className="flex items-center gap-2 text-sm">
                      <Icon className={`size-4 shrink-0 ${tone}`} />
                      <span className="text-slate-700 dark:text-slate-300 capitalize">{f.explanation}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <EmptyState icon={ShieldAlert} title="No prediction yet" description="Run predictions from the roster to generate one." />
          )}
        </Card>

        {/* Academics */}
        <Card title="Academic records" description="Assessment, exam and attendance by term">
          {detail && detail.academics.length > 0 ? (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead className="text-slate-500 dark:text-slate-400 text-left">
                  <tr>
                    <th className="px-5 py-2 font-medium">Term</th>
                    <th className="px-5 py-2 font-medium">Assessment</th>
                    <th className="px-5 py-2 font-medium">Exam</th>
                    <th className="px-5 py-2 font-medium">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.academics.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">{a.term ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{a.assessment_score ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{a.exam_score ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{a.attendance_pct != null ? `${a.attendance_pct}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="No academic records yet" />
          )}
        </Card>

        {/* Recent activity */}
        <Card title="Recent activity" description="Latest learning events">
          {detail && detail.activity.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {detail.activity.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 capitalize">{ev.action.replace(/_/g, ' ')}{ev.material_title ? ` — ${ev.material_title}` : ''}</span>
                  <span className="text-slate-400 dark:text-slate-500">{new Date(ev.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={TrendingUp} title="No activity yet" />
          )}
        </Card>

        {/* Intervention notes */}
        <Card title="Intervention notes" description="Private staff case log — not visible to parents or students">
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              placeholder="e.g. Flagged high-risk — called parent 2026-07-10, agreed weekly check-ins."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:[color-scheme:dark] px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
            />
            <div className="flex justify-end">
              <Button type="submit" loading={submitting} disabled={!noteBody.trim()}>Add note</Button>
            </div>
          </form>
          <ul className="mt-4 space-y-3">
            {notes.length === 0 ? (
              <li className="text-sm text-slate-400 dark:text-slate-500">No notes yet.</li>
            ) : (
              notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-[#f8fafc] dark:bg-slate-800/60 px-3 py-2">
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {n.author_name ?? 'Admin'} · {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}
```

Note: check the actual `Avatar` size prop values in `components/ui/Avatar.tsx` before finalizing — if `"lg"` is not a supported size, use the largest one it does support. Same for `Badge` tone values (already used in `RISK_META`, so those are safe).

- [ ] **Step 2: Add the route**

In `App.tsx`, import the page and add a route inside `<Routes>` (after the `/admin` route, ~line 44):

```tsx
import StudentDetailPage from './pages/admin/StudentDetail'
```

```tsx
<Route
  path="/admin/students/:id"
  element={
    <ProtectedRoute allow={['admin']}>
      <StudentDetailPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Resolve any prop-name mismatches flagged against `Avatar`/`Button`/`Card`/`EmptyState` by reading the component's actual props.

- [ ] **Step 4: Checkpoint** — detail page compiles and is routed.

---

## Task 9: Support-not-blame copy pass

**Files:**
- Modify: `app/frontend/src/lib/risk.ts` (and any parent-facing string that reads as blame)

- [ ] **Step 1: Review parent-facing risk copy**

Read `lib/risk.ts` `RISK_META` descriptions and the parent `PredictionCard` copy (`pages/parent/Dashboard.tsx` ~line 275-326). The design principle is support-not-blame: phrasing should frame risk as *"here's how to help,"* not *"your child is failing."* The current strings are already fairly gentle ("On track", "worth a check-in", "Needs attention"). Confirm the `high` band description in particular reads supportively.

- [ ] **Step 2: Adjust only if a string reads as blame**

If any string reads as blame, soften it. Example (only if needed) — keep the meaning, change the tone:

```typescript
high: { label: 'High risk', tone: 'red', description: 'Several signals are low right now — a good moment to step in and support.' },
```

Do NOT change the admin-facing roster copy (staff context is different) or the `label`/`tone` values (the roster + badges depend on them).

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Checkpoint** — copy reviewed; changes (if any) are tone-only.

---

## Task 10: In-browser verification (clears the Phase 5 gap too)

**Files:** none (verification only)

- [ ] **Step 1: Start both servers**

Backend (from `app/backend/`): `uvicorn app.main:app --reload`
Frontend (from `app/frontend/`): `npm run dev` → open `localhost:5173`.

- [ ] **Step 2: Ensure demo data exists**

If the roster is empty, seed it: from `app/backend/`, `python -m app.scripts.seed_demo` (idempotent). Then, as admin, click **Run predictions** so risk bands populate.

- [ ] **Step 3: Verify the admin flow**

Log in as admin → Risk Predictions section. Confirm:
- The roster lists children with **high-risk first**, then medium, then low.
- Clicking a row opens `/admin/students/:id`.
- The detail page shows the prediction + factors, academic records, recent activity.
- Add an intervention note → it appears in the log with author + timestamp; reload the page → the note persists.

- [ ] **Step 4: Verify the parent flow (also confirms the Phase 5 UI, never clicked through before)**

Log in as a parent linked to a child → Overview. Confirm:
- The Performance-risk card renders with explained factors.
- The Engagement card renders the current PEI **and** the "Engagement over time" trend (or the "not enough history yet" line if <2 periods).
- No risk prediction appears anywhere in the child ("My Learning") view.

- [ ] **Step 5: Clean up test data**

Remove any demo/test rows created for verification (real Supabase project — established habit): from `app/backend/`, `python -m app.scripts.seed_demo --clear`; and delete any test intervention notes (`delete from intervention_notes where body like 'Test%';`). Leave real accounts untouched.

- [ ] **Step 6: Update docs**

Update `app/README.md` "Current status" — mark Phase 6 done (roster, student detail + intervention notes, parent engagement trend). Add a dated Phase 6 entry to the top of `plans/Progress_Log.md`.

- [ ] **Step 7: Checkpoint** — all three pieces verified in-browser; Phase 5 UI confirmed; docs updated.

---

## Self-Review (completed during authoring)

- **Spec coverage:** roster (Tasks 2, 7) ✓; student detail (Tasks 2, 8) ✓; intervention notes table + endpoints + UI (Tasks 1, 3, 8) ✓; parent engagement trend (Tasks 4, 6) ✓; support-not-blame (Task 9) ✓; browser verification incl. Phase 5 gap (Task 10) ✓; `intervention_notes` RLS = enabled-no-policy per the golden rule (Task 1) ✓; YAGNI (no messages threading, no risk-history chart, no new charting dep — Recharts/TrendChart reused) ✓.
- **Placeholder scan:** every code step has concrete code; verification steps have concrete commands + expected output. No TBDs.
- **Type consistency:** `RosterRow`, `StudentDetail`, `AcademicRecord`, `InterventionNote`, `EngagementPoint` defined in Task 5 and used with matching field names in Tasks 6–8. Endpoint paths match between backend (Tasks 2–4) and frontend (Tasks 6–8): `/admin/students/roster`, `/admin/students/{id}`, `/admin/students/{id}/notes`, `/engagement/{child_id}/history`.
- **Known follow-ups for the implementer:** confirm `Avatar` size prop values and `Button`/`Card`/`EmptyState` prop names against their actual component files before finalizing Task 8 (flagged inline).
