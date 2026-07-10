// Row of toggleable filter chips — same interaction as the Admin role-filter
// cards: click to filter, click again to clear.
export function FilterChips<T extends string>({
  options,
  active,
  onChange,
  labels,
}: {
  options: T[]
  active: T | null
  onChange: (next: T | null) => void
  labels?: Partial<Record<T, string>>
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isActive = active === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(isActive ? null : opt)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors cursor-pointer ${
              isActive
                ? 'border-[#4665f2] bg-[#eef2fe] dark:bg-[#1c2a63] text-slate-900 dark:text-slate-100'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {labels?.[opt] ?? opt.replace(/_/g, ' ')}
          </button>
        )
      })}
    </div>
  )
}
