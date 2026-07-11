import type { ReactNode } from 'react'

export function Card({
  title,
  description,
  eyebrow,
  icon,
  actions,
  accent = false,
  children,
  className = '',
  padded = true,
}: {
  title?: string
  description?: string
  eyebrow?: string
  icon?: ReactNode
  actions?: ReactNode
  /** Thin lamp-gold top edge — use to mark the one flagship card on a screen. */
  accent?: boolean
  children?: ReactNode
  className?: string
  padded?: boolean
}) {
  const hasHeader = title || actions || eyebrow
  return (
    <div
      className={`relative overflow-hidden bg-[#FFFFFF] dark:bg-[#16223A] border border-[#E5E7F0] dark:border-slate-800 rounded-2xl shadow-[0_1px_2px_rgba(21,35,59,0.04),0_8px_24px_-16px_rgba(21,35,59,0.18)] ${className}`}
    >
      {accent && <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#9333EA] to-[#4F46E5]" />}
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="flex items-start gap-3">
            {icon && <div className="mt-0.5 text-[#4F46E5] dark:text-[#A5B4FC]">{icon}</div>}
            <div>
              {eyebrow && <p className="eyebrow text-[#4F46E5] dark:text-[#A5B4FC] mb-1">{eyebrow}</p>}
              {title && (
                <h2 className="font-display text-base font-bold text-[#1E1B3A] dark:text-slate-100">{title}</h2>
              )}
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
