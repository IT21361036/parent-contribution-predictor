import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export const inputClass =
  'w-full rounded-lg border border-[#e2e8f0] dark:border-slate-800 px-3 py-2 text-sm text-[#0f172a] dark:text-slate-100 placeholder:text-[#94a3b8] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent transition-shadow'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  // Wrapping the control in the <label> gives it an accessible name (screen
  // readers, Playwright's get_by_label) without needing to thread ids through.
  return (
    <div>
      <label className="block">
        <span className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-[#94a3b8] mt-1">{hint}</p>}
    </div>
  )
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

// A native <select> renders its dropdown popup (and <option> list) using the
// element's own `color-scheme`, not any Tailwind bg class — so in dark mode the
// popup falls back to white unless we set it here. `dark:[color-scheme:dark]`
// plus a solid surface makes the open list match the dark theme.
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${inputClass} bg-white dark:bg-slate-900 dark:[color-scheme:dark] ${props.className ?? ''}`}
    />
  )
}
