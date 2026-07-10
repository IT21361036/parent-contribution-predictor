import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MediaPipeAttentionTracker,
  MockAttentionTracker,
  type AttentionResult,
  type AttentionSnapshot,
  type AttentionTracker,
} from './tracker'

declare global {
  interface Window {
    // Set (e.g. in Playwright) to run the camera-free MockAttentionTracker so the
    // consent → tracking → summary → POST flow can be verified without a webcam.
    __ATTENTION_MOCK__?: boolean
  }
}

export type AttentionError = 'permission' | 'no-camera' | 'model' | 'unknown'

const ERROR_TEXT: Record<AttentionError, string> = {
  permission: 'Camera permission was denied. Attention verification is off — monitoring continues without it.',
  'no-camera': 'No camera was found. Attention verification is off — monitoring continues without it.',
  model: 'The attention model failed to load. Monitoring continues without attention verification.',
  unknown: 'Attention verification could not start. Monitoring continues without it.',
}

function classifyError(err: unknown): AttentionError {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') return 'permission'
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') return 'no-camera'
  }
  return 'unknown'
}

/**
 * Drives an attention tracker while `active` is true. Owns getUserMedia and the
 * hidden <video> it feeds; releases both on stop/unmount. `onStopped` receives
 * the final accumulated numbers once (the caller decides whether to POST them).
 */
export function useAttention(active: boolean, onStopped: (result: AttentionResult) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackerRef = useRef<AttentionTracker | null>(null)
  const onStoppedRef = useRef(onStopped)
  onStoppedRef.current = onStopped

  const [snapshot, setSnapshot] = useState<AttentionSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    let stream: MediaStream | null = null
    setError(null)
    setSnapshot(null)

    const tracker: AttentionTracker = window.__ATTENTION_MOCK__
      ? new MockAttentionTracker()
      : new MediaPipeAttentionTracker()
    tracker.onUpdate = (s) => {
      if (!cancelled) setSnapshot(s)
    }

    async function begin() {
      try {
        const video = videoRef.current
        if (!window.__ATTENTION_MOCK__) {
          if (!video) return
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
          if (cancelled) return
          video.srcObject = stream
          await video.play()
        }
        if (cancelled) return
        await tracker.init(video as HTMLVideoElement)
        if (cancelled) return
        trackerRef.current = tracker
        tracker.start()
      } catch (err) {
        if (cancelled) return
        // A camera that opened but a model that failed is a model error; a
        // getUserMedia rejection is a permission/device error.
        setError(ERROR_TEXT[stream ? 'model' : classifyError(err)])
      }
    }

    begin()

    return () => {
      cancelled = true
      const result = trackerRef.current?.stop()
      trackerRef.current = null
      if (stream) stream.getTracks().forEach((t) => t.stop())
      const video = videoRef.current
      if (video) video.srcObject = null
      if (result) onStoppedRef.current(result)
    }
  }, [active])

  const retryLiveness = useCallback(() => {
    trackerRef.current?.retryLiveness()
  }, [])

  return { videoRef, snapshot, error, retryLiveness }
}
