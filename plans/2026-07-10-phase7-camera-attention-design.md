# Phase 7 — Parent Attention Verification (Camera) — Design

**Date:** 2026-07-10
**Status:** Built (scope A + E). Backend built 2026-07-10; camera frontend built
2026-07-10 (see `frontend/src/lib/attention/` + `components/attention/AttentionPanel.tsx`).
Pure gaze/liveness/accumulation logic unit-verified; the authenticated mocked-flow
drive (parent login + `window.__ATTENTION_MOCK__`) and the real-webcam gaze-accuracy
tuning pass remain manual.
**Plan reference:** `Implementation_Plan_Updated.md` §"Phase 7"; `Research_Positioning.md` §3.

## Scope
**A (core) + E (safeguard).** No attention-quality classifier (B), no fine-tuning, no
video storage. The camera points at the **parent** to verify genuine attention during a
monitoring session — the project's novel contribution (MMLA applied to parents, not
students).

## Golden constraints
- **All video processing is client-side** (MediaPipe in the browser). Raw frames never
  leave the device; only computed numbers are POSTed. This is the privacy backbone.
- **No schema change** — `attention_scores` and `monitoring_sessions.camera_enabled` /
  `liveness_passed` already exist as the Phase 7 socket.
- Framing: association/prediction, not causation. Data is simulated except this real
  attention signal; keep that honest in the writeup.

## Architecture — where it fits
Bolts onto the Phase 4 monitoring-session lifecycle (`parent.py`: start / ping / end).
When a parent opens a session and **consents**, an in-browser attention tracker runs for
the session's duration; on session end the accumulated numbers are posted once.

## Components

### Frontend (`frontend/src/lib/attention/` + Parent portal wiring)
1. **Consent gate** — modal before the camera activates: states that only attention
   scores/durations are stored (no video). On opt-in, the session's `camera_enabled` is
   set true and the tracker starts. Declining → behavior-only session (graceful).
2. **Liveness check (E)** — at session start, confirm a live person via a detected blink
   or small head motion within ~5s → `liveness_passed = true`. On failure, attention is
   not counted (protects validity).
3. **Attention tracker (A)** — wraps **MediaPipe Tasks Vision `FaceLandmarker`**
   (iris landmarks + face blendshapes), pre-trained/as-is. Throttled ~5–10 fps: per
   frame decide *eyes-on-screen* (iris roughly centered within the eye + face oriented
   toward the screen), accumulate `attentive_seconds` against `total_seconds`, debounce
   brief look-aways (e.g. a short grace window so a blink/glance doesn't drop the count).
   Pure heuristic logic on top of the pre-trained model — no training.
4. **Camera-active indicator + stop control** — an always-visible dot/label whenever the
   camera is on, and a control to stop it.
5. **Own-score summary** — post-session: "monitored X min, attentive for Y min (Z%)."

### Backend (`app/routers/parent.py`) — BUILT THIS SESSION
- `POST /parent/sessions/{session_id}/attention` — parent must own the session (same
  ownership check the other session endpoints use); body: `attentive_seconds`,
  `total_seconds`, `liveness_passed` (bool). Computes `attention_score = attentive /
  total` (0..1, guarded for total=0), inserts an `attention_scores` row
  (`gaze_consistency`/`focus_quality` left null — those are scope B), and updates the
  session's `liveness_passed`. Service-role client (RLS-vs-API golden rule).

### Engagement integration (`app/ml/engagement.py`) — BUILT THIS SESSION
- The attention feature currently returns the neutral `ATTENTION_PLACEHOLDER = 0.5`.
  Change it to read the child's real `attention_scores` (joined via that child's
  `monitoring_sessions`) and return the average `attention_score` — falling back to the
  placeholder when there are none, so pre-camera behavior is unchanged.

## Data flow
```
getUserMedia → MediaPipe FaceLandmarker (in-browser, per frame)
  → eyes-on-screen? → accumulate attentive_seconds / total_seconds
  → (session end) POST /parent/sessions/{id}/attention {attentive_seconds, total_seconds, liveness_passed}
  → attention_scores row (attention_score 0..1) + monitoring_sessions.liveness_passed
  → engagement.py averages real attention_score → Parental Engagement Index
```

## Error handling / ethics
- Camera permission denied, no camera, or no face detected → behavior-only session;
  attention simply not recorded; engagement falls back to the 0.5 placeholder.
- Consent required before any camera use; visible camera-active indicator; parent can
  see their own attention score; **no raw video/frames persisted**.
- Liveness failure → attention data flagged/not counted.

## Testing / verification
- **Backend (this session):** route-registration/import check; the attention_score
  computation is a pure function (unit-checkable: total=0 → guarded; attentive≤total →
  0..1). Live POST exercise deferred (needs a parent token + session).
- **Frontend (fresh session):** unit-test the eyes-on-screen heuristic + accumulation in
  isolation; consent gate / indicator / behavior-only fallback / POST path are
  Playwright-testable with a **mocked** tracker; true gaze accuracy needs a **manual
  webcam pass** (headless browsers have no real camera).

## New dependency
`@mediapipe/tasks-vision` (frontend only). Model assets (FaceLandmarker `.task`) loaded
from the MediaPipe CDN or bundled locally — decide during frontend build.

## YAGNI (out of scope)
Attention-quality classifier (B), `gaze_consistency`/`focus_quality` computation, any
video storage, fine-tuning, deep learning.
