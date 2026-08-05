import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Alert'
import { Spinner } from '../ui/Spinner'
import { EmptyState } from '../ui/EmptyState'
import { apiGet, apiPut } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import type { StudentSubjects } from '../../lib/types'

// Which optional (elective) subjects this student takes. Core subjects are
// automatic for every student, so they are shown read-only for context.
export function OptionalSubjectsCard({ childId }: { childId: string }) {
  const [data, setData] = useState<StudentSubjects | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    let active = true
    apiGet<StudentSubjects>(`/admin/students/${childId}/subjects`)
      .then((res) => {
        if (!active) return
        setData(res)
        setSelected(new Set(res.assigned_ids))
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load subjects')
      })
    return () => {
      active = false
    }
  }, [childId])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      const res = await apiPut<{ assigned_ids: string[] }>(
        `/admin/students/${childId}/subjects`,
        { subject_ids: [...selected] },
      )
      setData((prev) => (prev ? { ...prev, assigned_ids: res.assigned_ids } : prev))
      setSelected(new Set(res.assigned_ids))
      toast.success('Optional subjects saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subjects')
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    !!data &&
    (selected.size !== data.assigned_ids.length ||
      data.assigned_ids.some((id) => !selected.has(id)))

  return (
    <Card
      title="Optional subjects"
      description="Core subjects are automatic — choose only this student's electives"
    >
      {error && <Alert>{error}</Alert>}

      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-2 text-slate-500 dark:text-slate-400">Core — every student</p>
            <div className="flex flex-wrap gap-1.5">
              {data.core.length === 0 ? (
                <span className="text-sm text-slate-400 dark:text-slate-500">None yet</span>
              ) : (
                data.core.map((s) => <Badge key={s.id}>{s.name}</Badge>)
              )}
            </div>
          </div>

          <div>
            <p className="eyebrow mb-2 text-slate-500 dark:text-slate-400">Optional — this student</p>
            {data.optional.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No optional subjects yet"
                description="Mark a subject as optional in Materials to offer it here."
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.optional.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition-colors hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-500">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-indigo-600 dark:accent-indigo-400"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.optional.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={save} loading={saving} disabled={!dirty}>
                Save subjects
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
