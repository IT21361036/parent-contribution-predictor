# Attention Verification & Focus Mode — Thesis Reference

**Scope:** the parental attention-verification subsystem (Phase 7) in its
session-long form, and the focus-mode monitoring-interruption feature.
**Last updated:** 2026-07-21.
**Use this** as the primary reference when writing up the camera/attention and
focus-mode contributions. For the whole system see `app/TECHNICAL_DOCUMENTATION.md`
and the research framing in `plans/Research_Positioning.md`.

---

## 1. Research framing

**Contribution.** Objective, camera-verified measurement of **parental** attention
during online monitoring of a child's learning. Existing engagement/attention
studies point the camera at the *student*; here the camera points at the *parent*.
This situates the work in **Multimodal Learning Analytics (MMLA)** — behavioural
logs (monitoring sessions, check-ins) combined with an affective-computing camera
signal — under a **Design Science Research** methodology.

**Why it matters.** Parental Engagement Index (PEI) inputs are otherwise
self-reported or purely behavioural; an on-device attention measure replaces
self-report with an objective signal while preserving privacy.

---

## 2. Attention verification (session-long)

### 2.1 Design decision and rationale
The camera was changed from a manual, per-child, opt-in run (with a 3-minute
minimum and a Stop button) to running for the **entire login session** (login →
logout), with consent asked **once per login**. Rationale: monitoring is a
continuous activity; measuring attention only in short, manually-started bursts
under-samples it and lets the parent choose their most attentive window. A
session-long camera reflects the true monitoring intent and yields a more
representative attention signal.

### 2.2 Perception pipeline (unchanged core)
1. **Face landmarking** — MediaPipe pre-trained **478-point FaceLandmarker**,
   ~8 fps, GPU delegate, in-browser, used as-is (no training).
2. **Liveness gate** — blink (eye-aspect-ratio dip/recover) or deliberate head
   motion (yaw sweep); 8 s timeout, retryable. Confirms a real person.
3. **Eyes-on-screen heuristic** — attentive iff iris roughly centred in both eyes
   **and** head faces forward, within thresholds.
4. **Accumulation with debouncing** — attentive-vs-total seconds per frame; 1.5 s
   grace so a blink/glance is not penalised; large frame gaps capped.
5. **Anti-gaming** — hidden tab counts as inattentive (total advances, attentive
   does not).

### 2.3 Session-long lifecycle and attribution
- **Consent once per login.** A modal precedes any camera use; on accept the
  camera stays on until logout. Declining → behaviour-only monitoring.
- **Per-session delta attribution.** The accumulator counts cumulatively from
  camera start. Attention attaches to whichever child's `monitoring_session` is
  active. On each session change and on logout, the **delta** since the last
  boundary (`Δattentive`, `Δtotal`) is written to the session that was active,
  then the baseline is rebased. Time with no child selected is not recorded.
- **Reliable persistence.** The active session's running total is saved every
  ~15 s. This keeps history live and — critically — survives logout: the final
  unmount write cannot authenticate after `signOut` clears the token, so the last
  interval save is the one that persists. The backend **upserts a single
  `attention_scores` row per session**, which also keeps the PEI's per-session
  average correct (one score per session, not many).

### 2.4 Privacy
All video is processed **in the browser**; only `{attentive_seconds,
total_seconds, liveness_passed}` are transmitted. **No raw video or frames ever
leave the device.** Camera denied/absent degrades gracefully to behaviour-only
monitoring with a neutral 0.5 attention placeholder.

---

## 3. Focus mode (monitoring-interruption tracking)

### 3.1 The technical constraint (state this explicitly in the thesis)
A web application **cannot** prevent a user from switching browser tabs, opening
other sites, or leaving the window — browsers deliberately deny pages that power
for security reasons. There is no API to lock the browser or block tab switching.
Focus mode therefore **detects and deters** rather than enforces.

### 3.2 Design
- **`useFocusGuard`** — listens to `visibilitychange` (tab switch/minimise) and
  window `blur`/`focus` (other app/window). Focus lost for more than a **5 s grace**
  window (to ignore momentary blur, e.g. a notification) → `away` state. A
  `suppress()` call marks intentional new-tab actions (report-card downloads) so
  they are not flagged.
- **`FocusGuardOverlay`** — full-screen *"Monitoring paused"* overlay blocking the
  portal on return until the parent clicks **Resume monitoring**. Unmissable and
  consequential without claiming to be a hard block.
- **Consequences** — each leave is logged via `POST /parent/sessions/{id}/focus-loss`
  (`focus_losses` count + `away_seconds` on `monitoring_sessions`), shown in the
  Monitoring Sessions view; tab-switch away-time also lowers the attention score
  via the accumulator (§2.2 step 5).

### 3.3 Decisions
Fullscreen was deliberately **not** used (Esc always exits it, so it adds friction
without real enforcement). Grace = 5 s. Consequence = penalise attention + log the
event (not a silent warning).

### 3.4 Stated limitation
Enforcement-by-visibility, not lockdown. True prevention requires a kiosk /
managed device or a desktop wrapper (e.g. Electron) — outside the web application.
This is a defensible boundary to note as future work.

---

## 4. Engagement Index integration (context)

PEI is a **transparent weighted formula, not ML**:

```
PEI = 0.4 · norm(monitoring_hours) + 0.3 · norm(check_frequency) + 0.3 · parental_attention
```

`parental_attention` = the average of the child's per-session `attention_score`
rows (§2.3), defaulting to a neutral **0.5** until the camera supplies values. The
attention subsystem thus feeds both a product surface (the parent's index) and the
performance-predictor's parental feature.

---

## 5. Data model & API (this subsystem)

**Tables**
- `monitoring_sessions` — `…, camera_enabled, liveness_passed, focus_losses,
  away_seconds`.
- `attention_scores` — `session_id, attention_score (0–1), attentive_seconds,
  total_seconds, computed_at`. One row per session (upserted).

**Endpoints (parent role)**
- `POST /parent/sessions/{id}/attention` — upsert the session's attention numbers.
- `POST /parent/sessions/{id}/focus-loss` — log one interruption.
- `GET /parent/attention-history` — all attention scores across the parent's
  sessions (feeds the Attention History view).

**Migrations**
- `2026-07-21-focus-mode.sql` — adds `focus_losses`, `away_seconds`.
  (`schema.sql` carries the same for fresh setups.)

---

## 6. Implementation file map (for citing)

| Concern | File |
|---|---|
| Camera hook (getUserMedia, lifecycle) | `frontend/src/lib/attention/useAttention.ts` |
| Tracker (MediaPipe + mock), phases | `frontend/src/lib/attention/tracker.ts` |
| Gaze/liveness geometry (pure fns) | `frontend/src/lib/attention/landmarks.ts` |
| Time accumulation + debouncing | `frontend/src/lib/attention/accumulator.ts` |
| Session-long camera UI + attribution | `frontend/src/components/attention/SessionCamera.tsx` |
| Focus detection hook | `frontend/src/lib/useFocusGuard.ts` |
| Focus overlay | `frontend/src/components/attention/FocusGuardOverlay.tsx` |
| Parent portal wiring | `frontend/src/pages/parent/Dashboard.tsx` |
| Attention + focus-loss endpoints | `backend/app/routers/parent.py` |
| PEI scorer (reads attention) | `backend/app/ml/engagement.py` |

**Design docs:** `plans/2026-07-10-phase7-camera-attention-design.md` (original),
`plans/2026-07-20-session-long-camera-design.md` (session-long revision).

---

## 7. Limitations & evaluation angles (thesis)

- **Gaze thresholds are heuristic**, not calibrated per device/user — treat the
  attention % as an **indicative** signal; a real deployment needs a calibration
  pass and, ideally, a labelled validation set (attentive/inattentive ground truth).
- **`parental_attention` is a 0.5 placeholder** in the simulated training cohort
  and is the least-important predictor feature; folding in real camera data (ethics
  permitting) is future work.
- **Focus mode cannot enforce**, only detect/deter (§3.1, §3.4).
- **Ethics:** camera on a parent is justified by strict on-device processing,
  no-video storage, explicit consent, and a liveness safeguard; real-world data
  collection would require formal ethics approval.
- **Possible evaluation:** correlate `attentive %` and `focus_losses`/`away_seconds`
  against monitoring behaviour and the child's outcomes in the simulated cohort,
  reported honestly as association, not causation.
