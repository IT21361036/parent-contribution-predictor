import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Eye, EyeOff, Loader2, Lock, ScanFace, ShieldCheck, Video } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Alert'
import { Badge } from '../ui/Badge'
import { Modal } from '../ui/Modal'
import { apiPost } from '../../lib/api'
import { useAttention, type AttentionResult } from '../../lib/attention'

// Phase 7 — parental attention verification. All video processing is client-side
// (MediaPipe in the browser via useAttention); only the accumulated seconds are
// POSTed on stop. Raw frames never leave the device.
export function AttentionPanel({ sessionId, childName }: { sessionId: string | null; childName?: string | null }) {
  const [active, setActive] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [summary, setSummary] = useState<AttentionResult | null>(null)
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  // The session id the current camera run belongs to — captured at consent so a
  // child switch mid-run still posts the numbers to the right session.
  const runSessionRef = useRef<string | null>(null)

  const handleStopped = useCallback((result: AttentionResult) => {
    const target = runSessionRef.current
    runSessionRef.current = null
    // Only record a genuine, live-verified sample. Liveness failure or no tracked
    // time means nothing is stored — engagement falls back to its placeholder.
    if (!target || !result.livenessPassed || result.totalSeconds <= 0) return
    setSummary(result)
    setPosting(true)
    setPostError(null)
    apiPost(`/parent/sessions/${target}/attention`, {
      attentive_seconds: result.attentiveSeconds,
      total_seconds: result.totalSeconds,
      liveness_passed: result.livenessPassed,
    })
      .catch((err) => setPostError(err instanceof Error ? err.message : 'Failed to save attention score'))
      .finally(() => setPosting(false))
  }, [])

  const { videoRef, snapshot, error, retryLiveness } = useAttention(active, handleStopped)

  // A change of monitored child/session ends any running camera (which posts the
  // in-flight numbers to the previous session via runSessionRef) and resets.
  useEffect(() => {
    setActive(false)
    setConsentOpen(false)
    setSummary(null)
    setPostError(null)
  }, [sessionId])

  function acceptConsent() {
    runSessionRef.current = sessionId
    setSummary(null)
    setPostError(null)
    setActive(true)
    setConsentOpen(false)
  }

  function stopCamera() {
    setActive(false)
  }

  const phase = snapshot?.phase
  const cameraOn = active && !error && phase !== 'liveness_failed'
  // Local self-view (like a video call) whenever the real camera is on. The mock
  // tracker has no stream, so there's nothing to preview there.
  const showSelfView = cameraOn && !window.__ATTENTION_MOCK__

  return (
    <Card
      title="Attention verification"
      description="Confirm you're genuinely watching — the camera stays on your device"
    >
      {/* Local self-view. Frames are processed on-device and shown only to you —
          never recorded or uploaded. Mirrored like a video call. Kept mounted
          (visually hidden when off) so the tracker's video ref stays stable. */}
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

      {!active && !summary && !error && (
        <IdlePrompt disabled={!sessionId} onStart={() => setConsentOpen(true)} />
      )}

      {cameraOn && (
        <LiveStatus
          phase={phase}
          onScreen={!!snapshot?.onScreen}
          attentiveSeconds={snapshot?.attentiveSeconds ?? 0}
          totalSeconds={snapshot?.totalSeconds ?? 0}
          onStop={stopCamera}
        />
      )}

      {active && phase === 'liveness_failed' && (
        <div className="space-y-3">
          <Alert>Couldn't confirm a live person. Attention wasn't counted.</Alert>
          <div className="flex gap-2">
            <Button size="sm" icon={<ScanFace className="size-4" />} onClick={retryLiveness}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={stopCamera}>
              Stop camera
            </Button>
          </div>
        </div>
      )}

      {summary && !active && <SummaryView result={summary} posting={posting} childName={childName} />}

      <ConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} onAccept={acceptConsent} />
    </Card>
  )
}

function IdlePrompt({ disabled, onStart }: { disabled: boolean; onStart: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Optionally turn on your camera so this session can verify your attention. Only the resulting
        percentage is stored — <span className="font-medium">no video is recorded or uploaded</span>.
      </p>
      <Button icon={<Camera className="size-4" />} onClick={onStart} disabled={disabled}>
        Verify my attention
      </Button>
      {disabled && (
        <p className="text-xs text-slate-400 dark:text-slate-500">Select a child above to start a session first.</p>
      )}
    </div>
  )
}

function LiveStatus({
  phase,
  onScreen,
  attentiveSeconds,
  totalSeconds,
  onStop,
}: {
  phase?: string
  onScreen: boolean
  attentiveSeconds: number
  totalSeconds: number
  onStop: () => void
}) {
  const pct = totalSeconds > 0 ? Math.round((attentiveSeconds / totalSeconds) * 100) : 0
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
          </span>
          <Video className="size-4 text-slate-400" /> Camera on
        </span>
        <Button size="sm" variant="secondary" icon={<EyeOff className="size-4" />} onClick={onStop}>
          Stop camera
        </Button>
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

      {phase === 'tracking' && (
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

function SummaryView({
  result,
  posting,
  childName,
}: {
  result: AttentionResult
  posting: boolean
  childName?: string | null
}) {
  const pct = result.totalSeconds > 0 ? Math.round((result.attentiveSeconds / result.totalSeconds) * 100) : 0
  const monitoredMin = Math.max(1, Math.round(result.totalSeconds / 60))
  const attentiveMin = Math.round(result.attentiveSeconds / 60)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-emerald-500" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Attention {posting ? 'saving…' : 'recorded'}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-slate-800 dark:text-slate-100">{pct}%</span>
        <span className="text-sm text-slate-400 dark:text-slate-500">attentive</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        While monitoring {childName ?? 'your child'} you were attentive for about {attentiveMin} of {monitoredMin} min.
        This feeds your engagement index.
      </p>
    </div>
  )
}

function ConsentModal({ open, onClose, onAccept }: { open: boolean; onClose: () => void; onAccept: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Turn on attention verification" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63]/60 p-3">
          <Lock className="size-5 shrink-0 text-[#4665f2] dark:text-[#93a8ff]" />
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Your camera runs <span className="font-medium">entirely on this device</span>. It measures only whether
            you're looking at the screen. <span className="font-medium">No video or images are recorded, saved, or
            uploaded</span> — only an attention percentage and the duration are stored.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-emerald-500 shrink-0" /> A quick liveness check (a blink or head turn)
            confirms a real person.
          </li>
          <li className="flex items-center gap-2">
            <Video className="size-4 text-slate-400 shrink-0" /> A visible indicator shows whenever the camera is on,
            and you can stop it at any time.
          </li>
          <li className="flex items-center gap-2">
            <Eye className="size-4 text-slate-400 shrink-0" /> Declining keeps monitoring fully active — just without
            attention verification.
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
