import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Client-side pagination. Slices an in-memory list and resets to page 1 whenever
// the list shrinks below the current page (e.g. a filter changes).
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])
  const from = (page - 1) * pageSize
  const pageItems = items.slice(from, from + pageSize)
  return { page, setPage, totalPages, pageItems, from, to: Math.min(from + pageSize, total), total }
}

function pageList(page: number, totalPages: number): (number | 'gap')[] {
  const wanted = new Set([1, totalPages, page, page - 1, page + 1])
  const sorted = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) out.push('gap')
    out.push(p)
    prev = p
  }
  return out
}

const BTN =
  'inline-flex items-center justify-center min-w-8 h-8 px-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9333EA]'

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const items = pageList(page, totalPages)
  return (
    <nav className="flex items-center justify-center gap-1 pt-5" aria-label="Pagination">
      <button
        className={`${BTN} text-slate-500 dark:text-slate-400 hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B] disabled:opacity-40 disabled:hover:bg-transparent`}
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </button>
      {items.map((it, i) =>
        it === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-slate-400 dark:text-slate-500 select-none">
            …
          </span>
        ) : (
          <button
            key={it}
            onClick={() => onChange(it)}
            aria-current={it === page ? 'page' : undefined}
            className={`${BTN} ${
              it === page
                ? 'bg-[#4F46E5] text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B]'
            }`}
          >
            {it}
          </button>
        ),
      )}
      <button
        className={`${BTN} text-slate-500 dark:text-slate-400 hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B] disabled:opacity-40 disabled:hover:bg-transparent`}
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  )
}
