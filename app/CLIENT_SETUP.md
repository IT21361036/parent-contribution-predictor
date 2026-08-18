# Client Setup — from a blank machine to a running app

Everything needed to run the O/L Learning Portal on a fresh Windows machine.
Follow the steps in order; each one tells you what "working" looks like.

Total time: about 30 minutes, most of it waiting on installs.

> Already have it running and just need the latest database changes? Jump to
> [Step 4](#step-4--create-the-database) and run Files 2–5 — the SQL for each is
> printed there in full, nothing to download.

---

## Step 0 — Install the prerequisites

Install these three, then **close and reopen your terminal** so the new commands
are found.

| What | Where | Notes |
|---|---|---|
| **Python 3.12** | [python.org/downloads](https://www.python.org/downloads/) | On the first installer screen, tick **"Add python.exe to PATH"**. Easy to miss, annoying to fix later. **Prefer 3.12 specifically** — that's the version this project is verified on (3.12.5). 3.13 will probably work but is untested here; 3.10 or older will not. |
| Node.js 20 LTS or newer | [nodejs.org](https://nodejs.org/) | The default options are fine. |
| Git | [git-scm.com/download/win](https://git-scm.com/download/win) | Default options are fine. |

Check all three (open PowerShell):

```powershell
python --version
node --version
git --version
```

You want three version numbers. If any says "not recognized", that tool isn't on
your PATH — reinstall it and make sure the PATH box is ticked.

---

## Step 1 — Get the code

```powershell
cd C:\Projects
git clone <your-repo-url> client01
cd client01\app
```

Replace `<your-repo-url>` with the actual repository URL, and `C:\Projects` with
wherever you keep your work. Every later command assumes you are in the `app`
folder.

---

## Step 2 — Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com) and click **New project**.
2. Give it a name, set a strong database password, pick the closest region.
3. Wait ~2 minutes for it to finish provisioning.

Now collect **four values** — you'll paste them into config files in Step 3.
Keep this browser tab open.

Go to **Project Settings → API**:

| Value | Where exactly |
|---|---|
| **Project URL** | Top of the page. Looks like `https://abcdefgh.supabase.co` |
| **anon public** key | Under "Project API keys" |
| **service_role** key | Same section — click **Reveal** |

Go to **Project Settings → API → JWT Settings**:

| Value | Where exactly |
|---|---|
| **JWT Secret** | Click **Reveal** |

> ⚠️ The **service_role** key and **JWT Secret** bypass all security rules.
> Never put them in the frontend, never commit them, never paste them into a
> chat or ticket. They belong only in `backend\.env`, which is gitignored.

---

## Step 3 — Fill in the two config files

**Backend.** Copy the example, then edit it:

```powershell
cd C:\Projects\client01\app\backend
copy .env.example .env
notepad .env
```

Fill in three of the four values from Step 2:

```
SUPABASE_URL=https://abcdefgh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=paste-the-service_role-key
SUPABASE_JWT_SECRET=paste-the-JWT-secret
CORS_ORIGINS=http://localhost:5173
```

Leave `CORS_ORIGINS` exactly as shown — that's the frontend's address.

**Frontend.** Same idea:

```powershell
cd C:\Projects\client01\app\frontend
copy .env.example .env
notepad .env
```

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=paste-the-anon-public-key
VITE_API_URL=http://localhost:8001
```

> **Change `VITE_API_URL` to port 8001.** The example file ships with `8000`,
> but the backend runs on **8001**. Leave it at 8000 and every page loads with
> nothing on it and "Failed to fetch" in the console.

Use the **anon** key here, not the service_role one. This file ends up in the
browser, where anyone can read it.

---

## Step 4 — Create the database

All the SQL lives in two places in the repo:

```
app\supabase\schema.sql          <- the whole database, one file
app\supabase\migrations\         <- four dated change files
```

**Which do you need?** Almost certainly just the first one:

| Your situation | Run this |
|---|---|
| **Brand-new, empty Supabase project** (the normal case) | **File 1 only.** It already contains everything the four migrations do. |
| You ran an older copy of this schema months ago | **Files 2–5 only.** Skip File 1 — it would fail on tables you already have. |

The migration files exist for databases that were built before those features
were written. A fresh project gets all of it from `schema.sql` in one go — each
migration file says so in its own header comment.

### Execution order

Run these top to bottom. **Order matters** — later files add columns to tables
that earlier ones create, so running them out of sequence fails with *"relation
does not exist"*.

| Order | File | Fresh project | Existing database |
|:--:|---|:--:|:--:|
| 1 | `supabase\schema.sql` | ✅ **run this** | ❌ skip |
| 2 | `migrations\2026-07-10-notifications-report-cards.sql` | ⏭️ already included | ✅ run |
| 3 | `migrations\2026-07-17-short-answer-grading.sql` | ⏭️ already included | ✅ run |
| 4 | `migrations\2026-07-21-focus-mode.sql` | ⏭️ already included | ✅ run |
| 5 | `migrations\2026-07-30-optional-subjects.sql` | ⏭️ already included | ✅ run |
| 6 | `notify pgrst, 'reload schema';` (4c below) | ✅ **always** | ✅ **always** |
| 7 | Check storage buckets (4d below) | ✅ **always** | ✅ **always** |

So a fresh project is really just: **File 1 → step 4c → step 4d.** Three actions.

For every file below: Supabase dashboard → **SQL Editor** → **New query** →
paste → **Run**. Expected result each time: *"Success. No rows returned."*

### Is that everything?

Yes — `schema.sql` alone is a complete database. Verified against the backend
code: it creates **18 tables**, and every one of the **17** the application
actually queries is among them. Nothing the code needs is missing.

It also creates the 4 enum types, 6 row-level-security policies, RLS enabled on
all 18 tables, 3 indexes, the `pgcrypto` extension, and both storage buckets.

The one unused table is `messages`, created deliberately ahead of a future
messaging feature so it won't need a migration later. Harmless — leave it.

---

### File 1 of 5 — `app\supabase\schema.sql`

**Fresh projects: this is the only one you need.**

It's ~350 lines, so rather than reprinting it here (where it could fall out of
sync with the real thing), open the actual file:

```powershell
notepad C:\Projects\client01\app\supabase\schema.sql
```

Select all (**Ctrl+A**), copy (**Ctrl+C**), paste into a New query, **Run**.

This creates every table, type, index and row-level-security policy, and both
storage buckets.

> ⚠️ Run this **once**, on an **empty** project. It uses plain `create table`,
> so a second run fails with *"already exists"*. That error is harmless, but it
> means you're in the Files 2–5 case instead.

Once it succeeds, **skip to 4c** — Files 2–5 are already included.

---

### File 2 of 5 — `migrations\2026-07-10-notifications-report-cards.sql`

*Existing databases only.* Adds in-app notifications, report-card storage, and
quiz due dates.

```sql
alter table quizzes add column if not exists due_date timestamptz;

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  child_id uuid references profiles(id) on delete cascade,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists notifications_recipient_idx on notifications(recipient_id, read_at);

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

alter table notifications enable row level security;
alter table report_cards enable row level security;

insert into storage.buckets (id, name, public)
values ('report-cards', 'report-cards', false)
on conflict (id) do nothing;
```

---

### File 3 of 5 — `migrations\2026-07-17-short-answer-grading.sql`

*Existing databases only.* Lets admins hand-mark short-answer questions.

```sql
alter table quiz_attempts add column if not exists question_scores jsonb;
alter table quiz_attempts add column if not exists graded boolean not null default true;
```

---

### File 4 of 5 — `migrations\2026-07-21-focus-mode.sql`

*Existing databases only.* Records when a parent leaves the portal mid-session.

```sql
alter table monitoring_sessions add column if not exists focus_losses int default 0;
alter table monitoring_sessions add column if not exists away_seconds int default 0;
```

---

### File 5 of 5 — `migrations\2026-07-30-optional-subjects.sql`

*Existing databases only.* Per-student optional (elective) subjects.

```sql
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
```

Every existing subject becomes **core** (visible to all students), so nothing
changes for anyone until you start marking subjects optional.

Files 2–5 are all written with `if not exists`, so re-running one is harmless if
you lose track of which you've done.

---

### 4c. Refresh the API cache

Run this last, on its own, whichever path you took:

```sql
notify pgrst, 'reload schema';
```

Supabase serves your tables through a layer that caches their structure. Without
this it can keep serving the old picture and report columns as missing even
though you just created them — the `PGRST204` error in the troubleshooting table
below.

---

### 4d. Check the storage buckets exist

Go to **Storage** in the sidebar. You should see two buckets:

- **materials**
- **report-cards**

If either is missing, create it by hand: **New bucket**, exact name from above,
**Public toggle OFF**. The SQL tries to create them, but buckets don't always
stick from SQL — the schema file says as much in its own comments. Skip this and
file uploads fail with a 404 later.

---

## Step 5 — Start the backend

```powershell
cd C:\Projects\client01\app\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The install takes a few minutes (it pulls scikit-learn and pandas).

> If `Activate.ps1` fails with *"running scripts is disabled on this system"*,
> run this once, then retry the activate line:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```

You'll know the venv is active because your prompt starts with `(.venv)`.

**Create the first admin account.** There is no sign-up page — every account,
including this one, is created server-side:

```powershell
python scripts/create_admin.py admin@school.lk "ChooseAStrongPassword" "Admin Name"
```

Use a real email format and remember the password — this is how you log in.

**Start the server:**

```powershell
uvicorn app.main:app --reload --port 8001
```

Expected: `Application startup complete.` **Leave this window open.** The server
runs until you close it or press Ctrl+C.

---

## Step 6 — Start the frontend

Open a **second** PowerShell window (the backend keeps running in the first):

```powershell
cd C:\Projects\client01\app\frontend
npm install
npm run dev
```

Expected: a `Local: http://localhost:5173/` line.

Open **http://localhost:5173** and log in with the admin email and password from
Step 5.

---

## Step 7 — Confirm it actually works

Click through these in order. Each one exercises a different piece, so if
something is misconfigured you'll find out here rather than later.

1. **Log in** as your admin → the dashboard loads with no red errors.
2. **Materials** → **New subject** → create one as **Core**, and a second as
   **Optional**. Both appear in the picker; the second shows "(optional)".
3. **Materials** → upload a PDF to a subject. This proves the storage bucket
   from 4d is real.
4. **Users** → **New user** → create a **child** account.
5. Open that child → the **Optional subjects** card lists your core subject as a
   grey badge and the optional one as a checkbox. Tick it → **Save**.
6. Log in as that child in a **private/incognito window** (so both sessions can
   coexist) → they see the core subject plus the one you assigned, and nothing
   else.

If all six pass, the install is correct. The app now works — but the **Insights**
and **Risk Predictions** charts will still be blank, because nothing has put any
grades in the database yet. Step 8 fixes that.

---

## Step 8 — Demo data (required for the charts)

**Do this if the Insights or Risk Predictions screens look empty.** They will
be, on a fresh project — and creating users, subjects, materials and quizzes
through the portal does **not** fill them.

Two tables drive those screens, `academic_records` (term grades) and
`engagement_index` (the parental engagement score). Nothing in the app UI ever
writes to either one: there is no screen for entering a student's term grades,
and the engagement score is only computed once a parent has actually run
monitoring sessions. The seed script below is the only thing that fills them.

Run both commands from `app\backend` with the venv active (`(.venv)` in your
prompt):

```powershell
cd C:\Projects\client01\app\backend
.venv\Scripts\Activate.ps1

# 1. Grades + engagement scores for the child accounts you already created
python -m app.scripts.seed_demo

# 2. Twelve simulated students, so the Insights scatter has a visible trend
python -m app.scripts.seed_demo --cohort 12
```

Then log in as admin → **Risk Predictions** → **Run predictions**. That fills
the risk bands and colours the Insights dots green/amber/red.

**Order matters for the first command.** It only touches child accounts that
already exist, so run it *after* Step 7. If you run it on an empty project it
prints `No child accounts found — create some children first, then re-run.` and
does nothing — easy to miss, and the charts stay empty.

**Why the second command is separate.** The Insights chart needs at least **two**
students carrying both a grade and an engagement score, and a correlation only
looks like anything with a dozen. `--cohort 12` creates
`demo.student.01…12@ol-demo.local` for exactly that purpose — the chart labels
itself "simulated cohort" because these are the students it means. Skip it and
Insights shows *"Not enough data yet"* no matter how much else you've entered.

Both commands are safe to re-run. `python -m app.scripts.seed_demo --clear`
removes everything they added, including the twelve demo accounts. Only run any
of this on a demo or test project — never on a database holding real student
records.

### Checking what the charts can see

If a chart is still empty, this prints exactly which students qualify and which
are missing an axis. It only reads, so it's safe anywhere:

```powershell
python -m app.scripts.diagnose_insights
```

The last line tells you whether the data is the problem or something else is.

### No terminal? Do the whole thing in SQL instead

Everything above is also available as plain SQL, which is often easier when
you're setting the app up for someone else — they only need their Supabase
dashboard, no venv and no Python.

Open **SQL Editor** → **New query** and use
[`supabase/insights-check-and-seed.sql`](supabase/insights-check-and-seed.sql):

| Part | Does what | Safe to run? |
|---|---|---|
| **Step 1** | One row: how many students exist, how many have each axis, how many can be plotted, plus a plain-English verdict | Read-only |
| **Step 2** | Per-student list — who is plotted, who is skipped, and which axis they're missing | Read-only |
| **Step 3** | Seeds both tables for every existing child account | **Writes** — demo/test projects only |

Step 3 produces the same tagged rows as `seed_demo` (`term='demo-2026-t1'`,
`period='demo'`), so the two are interchangeable and `--clear` still cleans up
after either. It spreads each student's numbers deterministically from their own
uuid, so re-running gives identical values and the scatter shows a believable
trend rather than every student stacked on one point.

The chart also explains itself now: when it can't draw, the panel names the
counts and which table is empty, so a screenshot is usually enough to tell what
is missing.

---

## When something goes wrong

Work from the **backend terminal window**, not the browser. The browser almost
always reports the wrong cause.

| What you see | What it actually means |
|---|---|
| **CORS policy / No 'Access-Control-Allow-Origin'** | Almost never a CORS problem. The backend crashed on that request; the error headers get lost on the way out. Look at the backend window for a red traceback and fix that. |
| **Could not find the 'X' column ... in the schema cache** (`PGRST204`) | A migration from Step 4b didn't run, or the cache is stale. Re-run the migration, then `notify pgrst, 'reload schema';`. |
| Pages load but every panel is empty, console says **Failed to fetch** | `VITE_API_URL` is wrong. It must be `http://localhost:8001`. Fix `frontend\.env`, then stop and restart `npm run dev` — Vite only reads .env at startup. |
| **Insights** says *"Not enough data yet"* — even with plenty of users, subjects and quizzes | Expected, and not a bug. That chart reads `academic_records` and `engagement_index`, and **no screen in the portal writes to either**. The panel itself names the counts and the missing table. Fix with Step 8, or entirely in the Supabase SQL Editor via `supabase/insights-check-and-seed.sql`. |
| **Risk Predictions** roster is empty or every band is blank | No child accounts, or predictions were never run. Create children, run Step 8, then **Risk Predictions → Run predictions**. |
| **Invalid API key** / can't log in | A key got mixed up in Step 3. `frontend\.env` takes the **anon** key; `backend\.env` takes the **service_role** key. |
| Upload fails with **404** | The storage bucket doesn't exist. Revisit 4d. |
| **`ValidationError: 3 validation errors for Settings`** — supabase_url / service_role_key / jwt_secret "Field required" | No `.env` file, or it's missing values. `.env` is gitignored, so a fresh clone never has one — you must create it from `.env.example` (Step 3). Needs a real Supabase project first (Step 2). |
| Same error **even though `.env` exists** | You're in the wrong folder. `config.py` loads `env_file=".env"` **relative to your current directory**, so every backend command must run from `app\backend` — not the repo root. |
| `create_admin.py` fails with a **relation/table error** | The schema hasn't been run. Do Step 4 first — the script writes a `profiles` row, and that table has to exist. |
| `create_admin.py` returns a **422 / weak-password error** | Supabase enforces a password minimum. Use something longer and mixed-case, not `admin1234`. |
| `pip install` fails with **"conflicting dependencies"** naming `httpx` and `supabase` | Your `requirements.txt` is out of date. It must pin `httpx==0.27.2`, not `0.28.1` — `supabase 2.10.0` requires `httpx>=0.26,<0.28`, so any 0.28+ pin makes the install unresolvable. Pull the latest code, or edit that one line and re-run. |
| `Activate.ps1 cannot be loaded` | Run the `Set-ExecutionPolicy` command in Step 5. |
| `'python'`/`'npm'` **is not recognized** | Step 0 didn't finish, or the terminal predates the install. Close every terminal, open a fresh one, try again. |

**Restart rules worth knowing:** changing `backend\.env` needs a backend restart;
changing `frontend\.env` needs a `npm run dev` restart; changing the database
needs neither — just `notify pgrst, 'reload schema';`.

---

## Daily use, after setup

Setup is one-off. To run the app afterwards, two terminals:

```powershell
# Terminal 1 — backend
cd C:\Projects\client01\app\backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8001
```

```powershell
# Terminal 2 — frontend
cd C:\Projects\client01\app\frontend
npm run dev
```

Then open http://localhost:5173.
