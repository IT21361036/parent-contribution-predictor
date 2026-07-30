# Session-long attention camera — design

**Date:** 2026-07-20
**Status:** Approved, implementing
**Area:** Parent portal — attention verification (Phase 7)

## Goal

The parent's attention camera should run for the **entire login session** — from the
moment the parent logs in until they log out — instead of being an opt-in, per-child
feature that the parent starts and stops manually.

## Decisions (confirmed with client)

1. **Consent:** Ask once per login. A consent prompt appears each login; on accept the
   camera stays on until logout.
2. **When on:** From login, always — the camera runs even before a child is selected.
   Attention is only *recorded* once a child (monitoring session) is active.
3. **Stop controls:** Remove the manual "Stop camera" button and the 3-minute minimum
   lock. The camera lifecycle is tied entirely to login/logout.

## Why Approach A (always-mounted session camera)

The parent portal (`/parent`) is a single mounted page that unmounts on logout, so a
component mounted at its top lives for exactly the login. This avoids a React context
provider (Approach B) or a backend "one session per login" rework (Approach C), both of
which add complexity with no current benefit. The per-child `monitoring_session` model
and the engagement scorer stay untouched.

## Component: `SessionCamera`

Replaces `AttentionPanel`. Always mounted at the top of `ParentDashboard` (no longer
gated on a selected child).

- **Consent every login:** a consent modal auto-opens on mount. Accepting starts the
  camera (the click is the user gesture `getUserMedia` requires). Declining leaves the
  camera off; monitoring continues without attention. `ParentDashboard` remounts each
  login, so consent is naturally re-asked.
- **Continuous run:** `useAttention(consentAccepted, …)` runs the whole time — liveness
  once, then tracking. Removed: idle "Verify my attention" CTA, "Stop camera" button,
  3-minute lock, post-stop summary card.
- **UI:** a slim persistent card — self-view thumbnail + live "Attentive / Looking away"
  badge while tracking; "Attention is on — select a child to start recording it" when no
  child is selected; existing error + liveness-retry affordances.

## Attribution (per-session deltas)

The accumulator counts cumulatively from camera start (`attentiveSeconds` / `totalSeconds`,
both rounded integers; `totalSeconds` only advances after liveness passes). To attribute
to the right child without stopping the camera:

- `latestRef` — latest cumulative snapshot (updated from `useAttention`'s snapshot).
- `baselineRef` — cumulative values captured when the current session became active.
- `currentSessionRef` — the session the camera time is currently counting toward.

On `activeSessionId` change:
1. **Flush** the previous session: `Δ = latest − baseline`; if a previous session existed,
   liveness passed, and `Δtotal > 0`, `POST /parent/sessions/{prev}/attention` with the
   delta.
2. **Rebase:** `baseline = latest`, `currentSession = activeSessionId`.

On unmount (logout), flush the final delta to `currentSessionRef`.

Result: each child-session gets exactly the attention accrued while it was active — one
clean `attention_scores` row per session. Time with no child selected is not attributed.

## Untouched

Tracker, accumulator, landmarks; all backend endpoints; DB schema; engagement scorer; the
`__ATTENTION_MOCK__` headless-test path.

## Follow-up copy change

The Attention History empty state ("Turn on 'Verify my attention'…") is reworded, since
there's no longer a manual toggle.
