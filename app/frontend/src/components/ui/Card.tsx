import type { ReactNode } from 'react'

export function Card({
  title,
  description,
  icon,
  actions,
  children,
  className = '',
  padded = true,
}: {
  title?: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  padded?: boolean
}) {
  const hasHeader = title || actions
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm ${className}`}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3">
            {icon && <div className="mt-0.5 text-slate-400 dark:text-slate-500">{icon}</div>}
            <div>
              {title && <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>}
              {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
            </div>
          </div>
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  )
}
