const PALETTE = [
  'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
  'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300',
]

function colorFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2)
  return (initials ?? '?').toUpperCase()
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'size-7 text-xs', md: 'size-9 text-sm', lg: 'size-12 text-base' }[size]
  return (
    <div className={`shrink-0 rounded-full flex items-center justify-center font-semibold ${sizeClass} ${colorFor(name)}`}>
      {initialsOf(name)}
    </div>
  )
}
