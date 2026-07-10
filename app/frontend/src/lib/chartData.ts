import type { TrendPoint } from '../components/charts/TrendChart'
import type { QuizAttempt } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

// Bucket ISO timestamps into one count per calendar day for the last `days`
// days (inclusive of today), so activity charts always show a full window
// even on days with no events.
export function dailyCounts(timestamps: string[], days = 14): TrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS)
    buckets.set(d.toDateString(), 0)
  }
  for (const ts of timestamps) {
    const d = new Date(ts)
    d.setHours(0, 0, 0, 0)
    const key = d.toDateString()
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({
    label: new Date(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value,
  }))
}

// Chronological score-% series for graded quiz attempts.
export function scoreTrend(attempts: QuizAttempt[]): TrendPoint[] {
  return attempts
    .filter((a) => a.max_score)
    .slice()
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
    .map((a) => ({
      label: new Date(a.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: Math.round(((a.score ?? 0) / (a.max_score || 1)) * 100),
    }))
}

export function averagePercent(attempts: QuizAttempt[]): number | null {
  const graded = attempts.filter((a) => a.max_score)
  if (!graded.length) return null
  return Math.round(
    (graded.reduce((sum, a) => sum + (a.score ?? 0) / (a.max_score || 1), 0) / graded.length) * 100
  )
}
