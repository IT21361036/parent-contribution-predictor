// Pure gaze/liveness geometry derived from MediaPipe FaceLandmarker output.
//
// Everything here is a pure function of the 478-point normalised landmark array
// (x/y in 0..1, origin top-left) so the eyes-on-screen heuristic and the blink /
// head-motion signals can be unit-tested in isolation with fixed fixtures — no
// camera, no model. The tracker layers timing/accumulation on top of these.

export interface Landmark {
  x: number
  y: number
  z?: number
}

// MediaPipe Face Mesh indices (with iris refinement, 478 points).
const RIGHT = { outer: 33, inner: 133, top: 159, bottom: 145, iris: 468 }
const LEFT = { inner: 362, outer: 263, top: 386, bottom: 374, iris: 473 }
// Face-width extremes (cheek edges) + nose tip, for a coarse head-yaw estimate.
const NOSE_TIP = 1
const FACE_LEFT = 234
const FACE_RIGHT = 454

// Decision thresholds. These are deliberately conservative defaults — true gaze
// accuracy needs a manual webcam tuning pass (see the design doc), so they live
// here as named constants rather than magic numbers scattered through the tracker.
export const GAZE = {
  /** Max horizontal iris deviation from eye-centre (0 = dead centre, 0.5 = corner). */
  horizontal: 0.23,
  /** Max vertical iris deviation from eye-centre. */
  vertical: 0.3,
  /** Max head-yaw deviation from facing-forward (0 = centred, 0.5 = full profile). */
  yaw: 0.16,
  /** EAR below this counts the eye as shut (blink). */
  blinkLow: 0.16,
  /** EAR above this counts the eye as open again (completes a blink). */
  blinkOpen: 0.24,
  /** Yaw range across the liveness window that counts as deliberate head motion. */
  motion: 0.06,
}

export interface GazeMetrics {
  /** Horizontal deviation of the iris from eye-centre, averaged over both eyes. */
  horizontal: number
  /** Vertical deviation of the iris from eye-centre, averaged over both eyes. */
  vertical: number
  /** Head yaw: 0.5 = facing forward, →0 or →1 = turned away. */
  yawRatio: number
  /** Eye-aspect-ratio (openness), averaged over both eyes. Low = eyes shut. */
  ear: number
}

function pos(lm: Landmark[], i: number): Landmark {
  return lm[i]
}

// Where `v` sits between `a` and `b` (0..1), order-independent, div-by-zero safe.
function span(v: number, a: number, b: number): number {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const width = hi - lo
  if (width < 1e-6) return 0.5
  return (v - lo) / width
}

// Eye-aspect-ratio: vertical lid gap over horizontal eye width. Robust to face
// scale/distance because it is a ratio. ~0.3 open, <0.15 shut.
function eyeAspectRatio(iOuter: Landmark, iInner: Landmark, iTop: Landmark, iBottom: Landmark): number {
  const wide = Math.hypot(iOuter.x - iInner.x, iOuter.y - iInner.y)
  if (wide < 1e-6) return 0
  const tall = Math.hypot(iTop.x - iBottom.x, iTop.y - iBottom.y)
  return tall / wide
}

// Iris deviation from the centre of its eye, as (horizontal, vertical) in 0..0.5-ish.
function irisDeviation(e: typeof RIGHT | typeof LEFT, lm: Landmark[]): { h: number; v: number } {
  const iris = pos(lm, e.iris)
  const inner = pos(lm, e.inner)
  const outer = pos(lm, e.outer)
  const top = pos(lm, e.top)
  const bottom = pos(lm, e.bottom)
  const h = Math.abs(span(iris.x, inner.x, outer.x) - 0.5)
  const v = Math.abs(span(iris.y, top.y, bottom.y) - 0.5)
  return { h, v }
}

/** Compute all gaze/liveness metrics from a single frame's landmarks. */
export function computeGaze(lm: Landmark[]): GazeMetrics {
  const r = irisDeviation(RIGHT, lm)
  const l = irisDeviation(LEFT, lm)

  const nose = pos(lm, NOSE_TIP)
  const faceL = pos(lm, FACE_LEFT)
  const faceR = pos(lm, FACE_RIGHT)
  const yawRatio = span(nose.x, faceL.x, faceR.x)

  const earR = eyeAspectRatio(pos(lm, RIGHT.outer), pos(lm, RIGHT.inner), pos(lm, RIGHT.top), pos(lm, RIGHT.bottom))
  const earL = eyeAspectRatio(pos(lm, LEFT.outer), pos(lm, LEFT.inner), pos(lm, LEFT.top), pos(lm, LEFT.bottom))

  return {
    horizontal: (r.h + l.h) / 2,
    vertical: (r.v + l.v) / 2,
    yawRatio,
    ear: (earR + earL) / 2,
  }
}

/** Eyes-on-screen: iris roughly centred in both eyes AND head facing forward. */
export function isOnScreen(m: GazeMetrics, t = GAZE): boolean {
  return (
    m.horizontal <= t.horizontal &&
    m.vertical <= t.vertical &&
    Math.abs(m.yawRatio - 0.5) <= t.yaw
  )
}

// A small state machine that confirms a live person from a blink OR deliberate
// head motion across a stream of frames. Pure: feed it metrics, ask if alive.
export class LivenessDetector {
  private eyesWereShut = false
  private minYaw = Number.POSITIVE_INFINITY
  private maxYaw = Number.NEGATIVE_INFINITY
  private alive = false
  private t: typeof GAZE

  constructor(t = GAZE) {
    this.t = t
  }

  observe(m: GazeMetrics): boolean {
    // Blink: EAR dips below the shut threshold, then recovers above open.
    if (m.ear <= this.t.blinkLow) this.eyesWereShut = true
    else if (this.eyesWereShut && m.ear >= this.t.blinkOpen) this.alive = true

    // Head motion: yaw sweeps a range wider than the motion threshold.
    this.minYaw = Math.min(this.minYaw, m.yawRatio)
    this.maxYaw = Math.max(this.maxYaw, m.yawRatio)
    if (this.maxYaw - this.minYaw >= this.t.motion) this.alive = true

    return this.alive
  }

  get isAlive(): boolean {
    return this.alive
  }
}
