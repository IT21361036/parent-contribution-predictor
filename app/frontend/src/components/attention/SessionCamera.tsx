import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Eye, EyeOff, Loader2, Lock, ScanFace, ShieldCheck, Video } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { apiPost } from '../../lib/api'
import { useAttention, type AttentionResult, type AttentionSnapshot } from '../../lib/attention'

// Phase 7 — parental attention verification, session-long.
//
// The camera runs for the ENTIRE login (this component is mounted at the top of the
// parent portal, which unmounts on logout). All video processing is client-side
// (MediaPipe in the browser via useAttention); only accumulated seconds are POSTed.
// Raw frames never leave the device.
//
// Attribution: the accumulator counts cumulatively from camera start. Whenever the
// active child session changes — and on logout/unmount — the delta accrued since the
// last session boundary is posted to the session that was active, so each child gets
// exactly the attention observed while it was selected.
export function SessionCamera({
  activeSessionId,
  childName,
}: {
  activeSessionId: string | null
  childName?: string | null
}) {
  // Consent is asked once per login. ParentDashboard remounts each login, so this
  // resets naturally — the modal auto-opens on mount and the camera only starts on accept.
  const [consentOpen, setConsentOpen] = useState(true)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)

  // Latest cumulative snapshot, the per-session baseline captured at the last boundary,
  // and the session the running time is currently counting toward. Refs (not state) so
  // the flush logic reads current values without re-subscribing.
  const latestRef = useRef<{ attentive: number; total: number }>({ attentive: 0, total: 0 })
  const baselineRef = useRef<{ attentive: number; total: number }>({ attentive: 0, total: 0 })
  const currentSessionRef = useRef<string | null>(null)
  const livenessRef = useRef(false)

  // Post the attention accrued between two cumulative marks to one session. Skips when
  // there's no session, liveness never passed, or no measurable tracked time.
  const flush = useCallback(
    (sessionId: string | null, from: { attentive: number; total: number }, to: { attentive: number; total: number }) => {
      if (!sessionId || !livenessRef.current) return
      const total = Math.round(to.total - from.total)
      const attentive = Math.min(Math.round(to.attentive - from.attentive), total)
      if (total <= 0) return
      apiPost(`/parent/sessions/${sessionId}/attention`, {
        attentive_seconds: Math.max(0, attentive),
        total_seconds: total,
        liveness_passed: true,
      }).catch((err) => setPostError(err instanceof Error ? err.message : 'Failed to save attention score'))
    },
    [],
  )

  const handleSnapshot = useCallback((s: AttentionSnapshot) => {
    latestRef.current = { attentive: s.attentiveSeconds, total: s.totalSeconds }
    if (s.livenessPassed) livenessRef.current = true
  }, [])

  // Final flush when the camera stops (logout / portal unmount): credit the last active
  // session with whatever accrued since its baseline.
  const handleStopped = useCallback(
    (result: AttentionResult) => {
      latestRef.current = { attentive: result.attentiveSeconds, total: result.totalSeconds }
      if (result.livenessPassed) livenessRef.current = true
      flush(currentSessionRef.current, baselineRef.current, latestRef.current)
    },
    [flush],
  )

  const { videoRef, snapshot, error, retryLiveness } = useAttention(consentAccepted, handleStopped)

  // Mirror each throttled snapshot into the ref so boundary flushes read live numbers.
  useEffect(() => {
    if (snapshot) handleSnapshot(snapshot)
  }, [snapshot, handleSnapshot])

  // Session boundary: the active child (and thus the monitoring session) changed. Flush
  // the delta to the session that was active, then rebase onto the new one.
  useEffect(() => {
    if (activeSessionId === currentSessionRef.current) return
    flush(currentSessionRef.current, baselineRef.current, latestRef.current)
    baselineRef.current = { ...latestRef.current }
    currentSessionRef.current = activeSessionId
  }, [activeSessionId, flush])

  // Persist the current session's running attention every 15s. This keeps the attention
  // history and engagement score fresh AND is what makes them survive logout: the final
  // unmount flush can't authenticate once signOut has cleared the token, so the last
  // interval save (≤15s stale) is the one that actually lands. The backend upserts, so
  // repeated saves update the same row rather than accumulating.
  useEffect(() => {
    if (!consentAccepted) return
    const id = window.setInterval(() => {
      if (currentSessionRef.current) flush(currentSessionRef.current, baselineRef.current, latestRef.current)
    }, 15000)
    return () => window.clearInterval(id)
  }, [consentAccepted, flush])

  function acceptConsent() {
    setPostError(null)
    setConsentAccepted(true)
    setConsentOpen(false)
  }

  const phase = snapshot?.phase
  const cameraOn = consentAccepted && !error && phase !== 'liveness_failed'
  // Local self-view (like a video call) whenever the real camera is on. The mock tracker
  // has no stream, so there's nothing to preview there.
  const showSelfView = cameraOn && !window.__ATTENTION_MOCK__
  const recording = cameraOn && !!activeSessionId

  return (
    <Card
      title="Attention verification"
      description="Your camera stays on for this whole session — it runs on your device"
    >
      {/* Local self-view. Frames are processed on-device and shown only to you — never
          recorded or uploaded. Mirrored like a video call. Kept mounted (visually hidden
          when off) so the tracker's video ref stays stable. */}
      <div className={showSelfView ? 'relative mb-4 w-full max-w-xs' : 'sr-only'}>
        <video
          ref={videoRef}
          className={showSelfView ? 'w-full aspect-video rounded-xl object-cover bg-slate-900' : ''}
          style={{ transform: 'scaleX(-1)' }}
          muted
          playsInline
          aria-hidden="true"
        />
        {showSelfView && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            You
          </span>
        )}
      </div>

      {error && <Alert className="mb-3">{error}</Alert>}
      {postError && <Alert className="mb-3">{postError}</Alert>}

      {!consentAccepted && !error && <IdlePrompt onEnable={() => setConsentOpen(true)} />}

      {cameraOn && (
        <LiveStatus
          phase={phase}
          onScreen={!!snapshot?.onScreen}
          attentiveSeconds={snapshot?.attentiveSeconds ?? 0}
          totalSeconds={snapshot?.totalSeconds ?? 0}
          recording={recording}
          childName={childName}
        />
      )}

      {consentAccepted && phase === 'liveness_failed' && (
        <div className="space-y-3">
          <Alert>Couldn't confirm a live person. Attention isn't being counted.</Alert>
          <Button size="sm" icon={<ScanFace className="size-4" />} onClick={retryLiveness}>
            Try again
          </Button>
        </div>
      )}

      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} onAccept={acceptConsent} />
    </Card>
  )
}

function IdlePrompt({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Turn on your camera so this session can verify your attention while you monitor your child. It stays on until
        you log out. Only the resulting percentage is stored —{' '}
        <span className="font-medium">no video is recorded or uploaded</span>.
      </p>
      <Button icon={<Camera className="size-4" />} onClick={onEnable}>
        Enable camera
      </Button>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Declining keeps monitoring fully active — just without attention verification.
      </p>
    </div>
  )
}

function LiveStatus({
  phase,
  onScreen,
  attentiveSeconds,
  totalSeconds,
  recording,
  childName,
}: {
  phase?: string
  onScreen: boolean
  attentiveSeconds: number
  totalSeconds: number
  recording: boolean
  childName?: string | null
}) {
  const pct = totalSeconds > 0 ? Math.round((attentiveSeconds / totalSeconds) * 100) : 0
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
          </span>
          <Video className="size-4 text-slate-400" /> Camera on for this session
        </span>
        {phase === 'tracking' && (
          <Badge tone={recording ? 'emerald' : 'slate'}>
            {recording ? `Recording${childName ? ` · ${childName}` : ''}` : 'Not recording'}
          </Badge>
        )}
      </div>

      {phase === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="size-4 animate-spin" /> Starting camera…
        </p>
      )}

      {phase === 'liveness' && (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <ScanFace className="size-4 text-indigo-500" /> Confirming a live person — please blink or turn your head
          slightly.
        </p>
      )}

      {phase === 'tracking' && !recording && (
        <p className="flex items-center gap-2 rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B]/60 px-3 py-2 text-xs text-[#4F46E5] dark:text-[#A5B4FC]">
          <Eye className="size-3.5 shrink-0" />
          Your camera is on. Select a child above to start recording your attention toward a session.
        </p>
      )}

      {phase === 'tracking' && recording && (
        <>
          <div className="flex items-center gap-2">
            {onScreen ? (
              <Badge tone="emerald">
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3.5" /> Attentive
                </span>
              </Badge>
            ) : (
              <Badge tone="amber">
                <span className="inline-flex items-center gap-1">
                  <EyeOff className="size-3.5" /> Looking away
                </span>
              </Badge>
            )}
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {attentiveSeconds}s attentive of {totalSeconds}s
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </>
      )}
    </div>
  )
}

function ConsentModal({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Turn on attention verification" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B]/60 p-3">
          <Lock className="size-5 shrink-0 text-[#4F46E5] dark:text-[#A5B4FC]" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Your camera runs <span className="font-medium">entirely on this device</span> for the whole session. It
            measures only whether you're looking at the screen.{' '}
            <span className="font-medium">No video or images are recorded, saved, or uploaded</span> — only an attention
            percentage and the duration are stored.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-500 shrink-0" /> A quick liveness check (a blink or head turn)
            confirms a real person.
          </li>
          <li className="flex items-center gap-2">
            <Video className="size-4 text-slate-400 shrink-0" /> The camera stays on until you log out; a visible
            indicator shows whenever it's on.
          </li>
          <li className="flex items-center gap-2">
            <Eye className="size-4 text-slate-400 shrink-0" /> Attention is recorded against a child only while that
            child is selected.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-slate-400 shrink-0" /> Declining keeps monitoring fully active — just
            without attention verification.
          </li>
        </ul>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Not now
          </Button>
          <Button icon={<Camera className="size-4" />} onClick={onAccept}>
            Enable camera
          </Button>
        </div>
      </div>
    </Modal>
  )
}
