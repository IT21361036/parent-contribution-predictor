// The attention tracker: turns a live <video> into accumulated attention numbers.
//
// Two implementations sit behind one interface:
//   • MediaPipeAttentionTracker — the real thing. Wraps MediaPipe Tasks-Vision
//     FaceLandmarker (pre-trained, run as-is), throttled to ~8fps. Per frame it
//     decides eyes-on-screen and accumulates attentive vs total time. A short
//     liveness gate (blink or head motion) runs first to confirm a real person.
//   • MockAttentionTracker — no camera, no model. Simulates the phase machine so
//     the consent → indicator → summary → POST flow is verifiable headlessly
//     (real webcams don't exist in CI). Enabled via window.__ATTENTION_MOCK__.
//
// Raw frames never leave this module — only the computed seconds do. That is the
// privacy backbone of Phase 7.

import { AttentionAccumulator } from './accumulator'
import { computeGaze, isOnScreen, LivenessDetector, type Landmark } from './landmarks'

export type AttentionPhase = 'loading' | 'liveness' | 'tracking' | 'liveness_failed' | 'stopped'

export interface AttentionSnapshot {
  phase: AttentionPhase
  faceDetected: boolean
  onScreen: boolean
  livenessPassed: boolean
  attentiveSeconds: number
  totalSeconds: number
}

export interface AttentionResult {
  attentiveSeconds: number
  totalSeconds: number
  livenessPassed: boolean
}

export interface AttentionTracker {
  init(video: HTMLVideoElement): Promise<void>
  start(): void
  retryLiveness(): void
  stop(): AttentionResult
  onUpdate?: (snapshot: AttentionSnapshot) => void
}

const DETECT_INTERVAL_MS = 120 // ~8fps
const EMIT_INTERVAL_MS = 250 // throttle React state updates to ~4/s
const LIVENESS_TIMEOUT_MS = 8000

// MediaPipe CDN assets, pinned to the installed @mediapipe/tasks-vision version.
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export class MediaPipeAttentionTracker implements AttentionTracker {
  onUpdate?: (snapshot: AttentionSnapshot) => void

  private landmarker: import('@mediapipe/tasks-vision').FaceLandmarker | null = null
  private video: HTMLVideoElement | null = null
  private accumulator = new AttentionAccumulator()
  private liveness = new LivenessDetector()

  private phase: AttentionPhase = 'loading'
  private faceDetected = false
  private onScreen = false
  private livenessPassed = false

  private rafId = 0
  private lastDetect = 0
  private lastEmit = 0
  private livenessStart = 0
  private hiddenAt: number | null = null

  async init(video: HTMLVideoElement): Promise<void> {
    this.video = video
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  }

  start(): void {
    this.phase = 'liveness'
    this.livenessStart = performance.now()
    this.lastDetect = 0
    this.lastEmit = 0
    document.addEventListener('visibilitychange', this.onVisibility)
    this.loop()
  }

  // Background tabs pause requestAnimationFrame and stop feeding the <video>, so we
  // can't gaze-track while hidden. But the camera stays on for the whole session and
  // the away time is reconciled as inattentive — switching tabs must lower the score,
  // otherwise the timer is trivially fooled by leaving the page open elsewhere.
  private onVisibility = (): void => {
    const now = performance.now()
    if (document.hidden) {
      if (this.hiddenAt === null) {
        this.hiddenAt = now
        this.onScreen = false
        if (this.phase === 'tracking') this.emit()
      }
    } else if (this.hiddenAt !== null) {
      const awayMs = now - this.hiddenAt
      this.hiddenAt = null
      if (this.phase === 'liveness') {
        this.livenessStart += awayMs // don't burn the liveness window while hidden
      } else if (this.phase === 'tracking') {
        this.accumulator.addInattentive(awayMs)
        this.accumulator.resync(now)
      }
    }
  }

  retryLiveness(): void {
    this.liveness = new LivenessDetector()
    this.phase = 'liveness'
    this.livenessStart = performance.now()
    if (!this.rafId) this.loop()
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop)
    const now = performance.now()
    if (now - this.lastDetect < DETECT_INTERVAL_MS) return
    this.lastDetect = now
    this.processFrame(now)
    if (now - this.lastEmit >= EMIT_INTERVAL_MS) {
      this.lastEmit = now
      this.emit()
    }
  }

  private processFrame(now: number): void {
    if (!this.landmarker || !this.video || this.video.readyState < 2) return

    let result
    try {
      result = this.landmarker.detectForVideo(this.video, now)
    } catch {
      return // transient decode hiccup — skip this frame
    }

    const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined
    this.faceDetected = !!landmarks

    if (!landmarks) {
      // No face: not attentive. Total still advances in the tracking phase so
      // walking away correctly lowers the score.
      this.onScreen = false
      if (this.phase === 'tracking') this.accumulator.update(now, false)
      return
    }

    const metrics = computeGaze(landmarks)

    if (this.phase === 'liveness') {
      if (this.liveness.observe(metrics)) {
        this.livenessPassed = true
        this.phase = 'tracking'
      } else if (now - this.livenessStart > LIVENESS_TIMEOUT_MS) {
        this.phase = 'liveness_failed'
        this.stopLoop()
      }
      return
    }

    if (this.phase === 'tracking') {
      this.onScreen = isOnScreen(metrics)
      this.accumulator.update(now, this.onScreen)
    }
  }

  private snapshot(): AttentionSnapshot {
    return {
      phase: this.phase,
      faceDetected: this.faceDetected,
      onScreen: this.onScreen,
      livenessPassed: this.livenessPassed,
      attentiveSeconds: this.accumulator.attentiveSeconds,
      totalSeconds: this.accumulator.totalSeconds,
    }
  }

  private emit(): void {
    this.onUpdate?.(this.snapshot())
  }

  private stopLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.rafId = 0
  }

  stop(): AttentionResult {
    this.stopLoop()
    document.removeEventListener('visibilitychange', this.onVisibility)
    // If we stop while still hidden (e.g. the tab was closed), credit the away time.
    if (this.hiddenAt !== null) {
      if (this.phase === 'tracking') this.accumulator.addInattentive(performance.now() - this.hiddenAt)
      this.hiddenAt = null
    }
    if (this.phase !== 'liveness_failed') this.phase = 'stopped'
    this.landmarker?.close()
    this.landmarker = null
    this.emit()
    return {
      attentiveSeconds: this.accumulator.attentiveSeconds,
      totalSeconds: this.accumulator.totalSeconds,
      livenessPassed: this.livenessPassed,
    }
  }
}

// Camera-free stand-in. Advances the phase machine on timers and accrues time at
// a fixed attentive ratio so the whole UI flow can be exercised without a webcam.
export class MockAttentionTracker implements AttentionTracker {
  onUpdate?: (snapshot: AttentionSnapshot) => void

  private accumulator = new AttentionAccumulator()
  private phase: AttentionPhase = 'loading'
  private livenessPassed = false
  private timer = 0
  private ratio: number

  constructor(ratio = 0.82) {
    this.ratio = ratio
  }

  async init(): Promise<void> {
    this.phase = 'liveness'
  }

  start(): void {
    this.phase = 'liveness'
    const t0 = performance.now()
    this.timer = window.setInterval(() => {
      const now = performance.now()
      if (this.phase === 'liveness') {
        if (now - t0 > 800) {
          this.livenessPassed = true
          this.phase = 'tracking'
        }
      } else if (this.phase === 'tracking') {
        // Simulate an attentive fraction by toggling on-screen deterministically.
        const onScreen = (Math.floor(now / 250) % 100) / 100 < this.ratio
        this.accumulator.update(now, onScreen)
      }
      this.emit()
    }, 250)
  }

  retryLiveness(): void {
    this.phase = 'tracking'
    this.livenessPassed = true
  }

  private emit(): void {
    this.onUpdate?.({
      phase: this.phase,
      faceDetected: this.phase !== 'liveness_failed',
      onScreen: this.phase === 'tracking',
      livenessPassed: this.livenessPassed,
      attentiveSeconds: this.accumulator.attentiveSeconds,
      totalSeconds: this.accumulator.totalSeconds,
    })
  }

  stop(): AttentionResult {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = 0
    this.phase = 'stopped'
    this.emit()
    return {
      attentiveSeconds: this.accumulator.attentiveSeconds,
      totalSeconds: this.accumulator.totalSeconds,
      livenessPassed: this.livenessPassed,
    }
  }
}
