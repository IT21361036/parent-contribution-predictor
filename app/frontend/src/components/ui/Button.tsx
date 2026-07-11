import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#9333EA] ' +
  'dark:focus-visible:ring-offset-[#0E1726] disabled:opacity-50 disabled:cursor-not-allowed ' +
  'hover:-translate-y-px active:translate-y-0 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[#4F46E5] text-white shadow-sm hover:bg-[#4338CA]',
  secondary: 'bg-[#FFFFFF] dark:bg-[#16223A] text-[#1E1B3A] dark:text-slate-100 border border-[#E5E7F0] dark:border-slate-800 shadow-sm hover:bg-[#EEF0F7] dark:hover:bg-slate-800/60',
  ghost: 'text-[#64748b] dark:text-slate-400 hover:bg-[#EEF0F7] dark:hover:bg-slate-800/60 hover:text-[#4338CA] dark:hover:text-[#C7D2FE]',
  danger: 'bg-[#C9553B] text-white shadow-sm hover:bg-[#AE4529]',
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
