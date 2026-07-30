import { useCallback, useEffect, useRef, useState } from 'react'

// Focus mode. A website can't actually block a user from switching tabs or
// leaving — browsers forbid that — so this DETECTS leaving instead: when the
// portal loses focus (tab switch, minimise, or focus moving to another app or
// window) for longer than the grace period, `away` flips true so the portal can
// show a blocking "monitoring paused" overlay. On return it reports how long the
// parent was gone, so the leave can be logged.
//
// A short grace period avoids false alarms from momentary blur (a notification
// stealing focus, an accidental click). Intentional app actions that move focus
// away on purpose — e.g. opening a report card in a new tab — call `suppress()`
// so they don't count as leaving.

const GRACE_MS = 5000

export interface FocusGuard {
  away: boolean
  awaySeconds: number
  /** Suppress the guard briefly (e.g. around an intentional window.open). */
  suppress: (ms?: number) => void
  /** Dismiss the overlay after the parent acknowledges returning. */
  acknowledge: () => void
}

export function useFocusGuard(
  active: boolean,
  onReturn?: (awaySeconds: number) => void,
): FocusGuard {
  const [away, setAway] = useState(false)
  const [awaySeconds, setAwaySeconds] = useState(0)

  const leftAtRef = useRef<number | null>(null)
  const graceTimerRef = useRef<number | null>(null)
  const suppressUntilRef = useRef(0)
  const onReturnRef = useRef(onReturn)
  onReturnRef.current = onReturn

  const clearGrace = () => {
    if (graceTimerRef.current !== null) {
      window.clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
  }

  const suppress = useCallback((ms = 12000) => {
    suppressUntilRef.current = performance.now() + ms
  }, [])

  const acknowledge = useCallback(() => {
    setAway(false)
    setAwaySeconds(0)
  }, [])

  useEffect(() => {
    if (!active) return

    // Focus lost: after the grace window (and only if still gone), show the overlay.
    function onLeave() {
      if (performance.now() < suppressUntilRef.current) return
      if (leftAtRef.current !== null) return // already tracking a leave
      leftAtRef.current = performance.now()
      clearGrace()
      graceTimerRef.current = window.setTimeout(() => {
        graceTimerRef.current = null
        if (leftAtRef.current !== null) setAway(true)
      }, GRACE_MS)
    }

    // Focus regained: cancel a pending grace, and if the overlay was showing,
    // report the away duration so it can be logged and acknowledged.
    function onBack() {
      clearGrace()
      const leftAt = leftAtRef.current
      leftAtRef.current = null
      if (leftAt === null) return
      const seconds = Math.round((performance.now() - leftAt) / 1000)
      // Only a leave long enough to have tripped the overlay counts.
      if (seconds * 1000 >= GRACE_MS) {
        setAwaySeconds(seconds)
        setAway(true)
        onReturnRef.current?.(seconds)
      }
    }

    function onVisibility() {
      if (document.hidden) onLeave()
      else onBack()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onLeave)
    window.addEventListener('focus', onBack)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('focus', onBack)
      clearGrace()
      leftAtRef.current = null
    }
  }, [active])

  return { away, awaySeconds, suppress, acknowledge }
}
