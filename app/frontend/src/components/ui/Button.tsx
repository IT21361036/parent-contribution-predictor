import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4665f2] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[#4665f2] text-white shadow-sm hover:bg-[#3550d4]',
  secondary: 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-[#e2e8f0] dark:border-slate-800 shadow-sm hover:bg-[#f8fafc] dark:hover:bg-slate-800/60',
  ghost: 'text-[#64748b] dark:text-slate-400 hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 hover:text-[#3550d4] dark:hover:text-[#a5b6ff]',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading, className = '', children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  )
})
