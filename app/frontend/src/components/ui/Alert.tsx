import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'

export function Alert({
  tone = 'error',
  className = '',
  children,
}: {
  tone?: 'error' | 'success'
  className?: string
  children: ReactNode
}) {
  const isError = tone === 'error'
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        isError ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300' : 'bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
      } ${className}`}
    >
      {isError ? <AlertTriangle className="size-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="size-4 mt-0.5 shrink-0" />}
      <span>{children}</span>
    </div>
  )
}
