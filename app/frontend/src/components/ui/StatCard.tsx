import type { LucideIcon } from 'lucide-react'
import { ACCENT, type AccentKey } from '../../lib/theme'

// Rich stat tile shared by every portal's overview row — tinted icon tile,
// small label, big value, optional sub-text, and an accent underline bar at
// the bottom edge (per the dashboard mockup).
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'blue',
  className = '',
  style,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  sub?: string
  accent?: AccentKey
  className?: string
  style?: React.CSSProperties
}) {
  const a = ACCENT[accent]
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 pb-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${className}`}
      style={style}
    >
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${a.tile}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <p className="text-2xl font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate">{value}</p>
        </div>
      </div>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{sub}</p>}
      <span className={`absolute inset-x-0 bottom-0 h-1 ${a.bar}`} />
    </div>
  )
}
