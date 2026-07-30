# Notifications + Report Cards — Design & Implementation Plan

**Date:** 2026-07-10
**Status:** Implemented 2026-07-10 (see Progress_Log). Pending: apply DB
migration + create bucket, then manual end-to-end pass.
**Depends on:** Phases 0–7 complete. No conflict with Phase 7 camera work.

## Scope (agreed)
Two features on top of the finished 8-phase system:
1. **In-app notifications** to parents, fired on defined events; **reading a
   notification feeds the engagement score** (folded into the existing check-ins
   signal — no ML retrain).
2. **Report cards** — admin uploads a PDF per student per term; parents view/download.

### Decisions locked
- Delivery: **in-app only** (no email/SMTP).
- Triggers: **quiz results published, quiz due soon, report card published, risk alert**.
- Scoring impact: **fold notification-reads into existing `check_frequency`** — no new
  ML feature, no retrain, thesis model unchanged.
- Report cards: **admin uploads PDF per term**; private `report-cards` bucket.

## Golden constraints (carried from project)
- Service-role client for all writes (RLS-vs-API golden rule).
- Ownership checks: parent must be linked to the child (`parent_child_link`); admin via
  `require_admin`.
- Framing stays association, not causation.

---

## A. Notifications

### Schema — new table `notifications`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| recipient_id | uuid fk profiles | the parent |
| type | text | 'quiz_result' \| 'quiz_due' \| 'report_card' \| 'risk_alert' |
| title | text | |
| body | text | |
| child_id | uuid fk profiles null | the child it concerns |
| related_id | uuid null | quiz_id / report_card_id / prediction id |
| read_at | timestamptz null | set when parent opens it — drives the scoring impact |
| created_at | timestamptz default now() | |

Index: `(recipient_id, read_at)`. Dedup key for lazy 'quiz_due': `(recipient_id, type,
related_id)` — don't insert if one already exists unread for the same quiz.

### Triggers (all create rows via an internal `create_notification()` helper)
1. **quiz_result** — when a quiz attempt is graded/released, notify the child's linked
   parent(s). *Verify at impl: whether results have an explicit "release" step or are
   immediate on submit; hook wherever the score becomes visible.*
2. **report_card** — on admin report-card upload (feature B), notify parents.
3. **quiz_due** — needs a new `due_date` on `quizzes`. No cron in prototype → generate
   lazily in `GET /notifications`: for each linked child, quizzes due within N days
   (default 3) not yet attempted → ensure a deduped unread notification.
4. **risk_alert** — when `predictions` run and a child's band worsens (esp. → high),
   notify parents. Hook in the prediction-run path; compare new band to previous.

### Endpoints
- `GET /notifications` (parent) → `{ items: [...], unread: n }`, newest first. Also runs
  the lazy quiz_due generation before returning.
- `POST /notifications/{id}/read` (parent, owns it) → sets `read_at`. **Scoring hook.**
- (optional) `POST /notifications/read-all`.
- Creation is internal only (no public POST).

### Engagement impact — `app/ml/engagement.py`
- Locate how `check_frequency` is currently computed (from monitoring-session
  `history_checks` over the period).
- Add the count of notifications the parent **read** in the period to that same
  involvement count (or a documented weighted blend). Result: reading notifications
  raises `check_frequency` → raises PEI via the existing 30% weight.
- No change to `FEATURES`, no regenerate, no retrain. Add a one-line comment + note in
  README so the writeup stays honest ("responsiveness folded into check-ins").

---

## B. Report cards

### Schema — new table `report_cards`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| child_id | uuid fk profiles | |
| term | text | e.g. "2025 Term 1" |
| title | text null | |
| storage_path | text | PDF in private `report-cards` bucket |
| uploaded_by | uuid fk profiles | admin |
| created_at | timestamptz default now() | |

**Bucket:** create a **private `report-cards`** Supabase bucket manually (schema.sql does
not reliably create buckets — same lesson as `materials`).

### Endpoints
- Admin `POST /admin/students/{child_id}/report-cards` (multipart: `term`, `title`,
  file) → upload to bucket, insert row, fire `report_card` notification to linked
  parents. Reuse the `materials` upload/`apiUpload` pattern.
- Admin `GET /admin/students/{child_id}/report-cards` → list.
- Admin `DELETE /admin/report-cards/{id}` (optional).
- Parent `GET /parent/children/{child_id}/report-cards` (linked) → list.
- Parent download: signed URL (follow existing materials download pattern), ownership
  checked.

### UI
- **Admin — Student Detail page:** a "Report cards" Card: upload form (term + file) + list
  with download links.
- **Parent portal — two new sidebar sections** (`NAV` in `pages/parent/Dashboard.tsx`):
  - **Notifications**: unread badge on the nav item; list newest-first; clicking an item
    calls `POST /notifications/{id}/read` (the scoring hook) and, if it has a
    `related_id`, deep-links to the relevant section/report card.
  - **Report Cards**: list per selected child + download button.

### Frontend plumbing
- `lib/types.ts`: add `Notification`, `ReportCard` interfaces.
- `lib/api.ts`: already has `apiGet/apiPost/apiUpload` — reuse.
- Unread count can be fetched with the children load and refreshed after marking read.

---

## Build order (execution plan)
1. **DB:** create `notifications` + `report_cards` tables; add `quizzes.due_date`; create
   `report-cards` bucket. (SQL migration.)
2. **Backend notifications:** `create_notification()` helper + `notifications` router
   (GET with lazy quiz_due, POST read). Register router.
3. **Backend hooks:** fire quiz_result (quiz grade path), risk_alert (prediction run).
4. **Backend report cards:** admin upload/list/delete + parent list/download; fire
   report_card notification on upload.
5. **engagement.py:** blend read-notifications into `check_frequency`.
6. **Frontend types + admin UI:** report-cards card on Student Detail.
7. **Frontend parent UI:** Notifications section (+ unread badge, mark-read) and Report
   Cards section; wire nav.
8. **Verify:** `tsc --noEmit` green; backend import/route check; manual: admin uploads a
   report card → parent sees a notification → opening it marks read → engagement check-in
   count rises. Playwright mock path for the notification list.

## Testing
- Backend: route registration/import check; `create_notification` and the band-worsened
  comparison are pure-ish (unit-checkable). Live POST deferred to a manual pass.
- Frontend: `tsc` green; notification list + mark-read verifiable with mocked API;
  file upload/download needs the real bucket (manual pass).

## YAGNI (out of scope)
Email/SMS, push, notification preferences/mute, cron scheduling (quiz_due is lazy),
per-notification threading, read receipts beyond `read_at`, structured/auto-generated
report cards (PDF upload only).

## Open items to verify at implementation time
- Quiz result "release" model (explicit release vs immediate on submit).
- Exact current `check_frequency` computation in `engagement.py`.
- Existing materials signed-URL download helper to reuse for report cards.
- Prediction-run path + where previous band is available for the worsened comparison.
