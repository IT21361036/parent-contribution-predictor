import { AlertTriangle, Eye } from 'lucide-react'
import { Button } from '../ui/Button'

function formatAway(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m}m ${s}s` : `${m}m`
}

// Full-screen blocking overlay shown when the parent leaves the portal during a
// monitoring session (see useFocusGuard). It can't stop them leaving — browsers
// don't allow that — but it makes the interruption unmissable on return and
// blocks the portal until they acknowledge.
export function FocusGuardOverlay({
  awaySeconds,
  childName,
  onResume,
}: {
  awaySeconds: number
  childName?: string | null
  onResume: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f0b24]/90 backdrop-blur-sm p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Monitoring paused"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-7 text-center shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#FEF3C7] dark:bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-7" />
        </div>
        <h2 className="font-display text-xl font-extrabold text-[#1E1B3A] dark:text-slate-100">
          Monitoring paused
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          You left the portal{childName ? ` while monitoring ${childName}` : ''}
          {awaySeconds > 0 ? ` for ${formatAway(awaySeconds)}` : ''}. Please stay on this page while your session is
          active — this time is recorded and counts as time away.
        </p>
        <Button className="mt-6 w-full justify-center" icon={<Eye className="size-4" />} onClick={onResume}>
          Resume monitoring
        </Button>
      </div>
    </div>
  )
}
