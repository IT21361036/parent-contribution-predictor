import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, TrendingUp, TrendingDown } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { Alert } from '../../components/ui/Alert'
import { apiGet, apiPost } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { RISK_META } from '../../lib/risk'
import type { StudentDetail, Prediction, InterventionNote } from '../../lib/types'

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<StudentDetail | null>(null)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [notes, setNotes] = useState<InterventionNote[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  async function loadNotes(childId: string) {
    try {
      setNotes(await apiGet<InterventionNote[]>(`/admin/students/${childId}/notes`))
    } catch {
      setNotes([])
    }
  }

  useEffect(() => {
    if (!id) return
    apiGet<StudentDetail>(`/admin/students/${id}`)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load student'))
    apiGet<Prediction>(`/predictions/${id}`)
      .then(setPrediction)
      .catch(() => setPrediction(null))
    loadNotes(id)
  }, [id])

  async function addNote(e: FormEvent) {
    e.preventDefault()
    if (!id || !noteBody.trim()) return
    setSubmitting(true)
    try {
      await apiPost(`/admin/students/${id}/notes`, { body: noteBody.trim() })
      setNoteBody('')
      await loadNotes(id)
    } catch (err) {
      // keep the typed text so nothing is lost, but surface the failure
      toast.error(err instanceof Error ? err.message : 'Failed to add note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f4f1] dark:bg-slate-950 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <button onClick={() => navigate('/admin')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors">
          <ArrowLeft className="size-4" /> Back to roster
        </button>

        {loadError && <Alert>{loadError}</Alert>}

        {detail && (
          <div className="flex items-center gap-3">
            <Avatar name={detail.profile.full_name} size="lg" />
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{detail.profile.full_name}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {[detail.profile.grade_level, detail.profile.email].filter(Boolean).join(' · ') || 'Student'}
              </p>
            </div>
            {prediction && <div className="ml-auto"><Badge tone={RISK_META[prediction.risk_band].tone}>{RISK_META[prediction.risk_band].label}</Badge></div>}
          </div>
        )}

        {/* Prediction */}
        <Card title="Performance risk" description="Why the model predicts this band">
          {prediction ? (
            <>
              <div className="flex items-center gap-3">
                <Badge tone={RISK_META[prediction.risk_band].tone}>{RISK_META[prediction.risk_band].label}</Badge>
                {prediction.risk_score != null && (
                  <span className="text-sm text-slate-500 dark:text-slate-400">{Math.round(prediction.risk_score * 100)}% confidence</span>
                )}
              </div>
              <ul className="mt-4 space-y-2">
                {(prediction.top_factors ?? []).map((f) => {
                  const Icon = f.direction === 'raises' ? TrendingUp : TrendingDown
                  const tone = f.direction === 'raises' ? 'text-red-500' : 'text-emerald-500'
                  return (
                    <li key={f.feature} className="flex items-center gap-2 text-sm">
                      <Icon className={`size-4 shrink-0 ${tone}`} />
                      <span className="text-slate-700 dark:text-slate-300 capitalize">{f.explanation}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <EmptyState icon={ShieldAlert} title="No prediction yet" description="Run predictions from the roster to generate one." />
          )}
        </Card>

        {/* Academics */}
        <Card title="Academic records" description="Assessment, exam and attendance by term">
          {detail && detail.academics.length > 0 ? (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead className="text-slate-500 dark:text-slate-400 text-left">
                  <tr>
                    <th className="px-5 py-2 font-medium">Term</th>
                    <th className="px-5 py-2 font-medium">Assessment</th>
                    <th className="px-5 py-2 font-medium">Exam</th>
                    <th className="px-5 py-2 font-medium">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.academics.map((a) => (
                    <tr key={a.id}>
                      <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">{a.term ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{a.assessment_score ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{a.exam_score ?? '—'}</td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{a.attendance_pct != null ? `${a.attendance_pct}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={TrendingUp} title="No academic records yet" />
          )}
        </Card>

        {/* Recent activity */}
        <Card title="Recent activity" description="Latest learning events">
          {detail && detail.activity.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {detail.activity.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 capitalize">{ev.action.replace(/_/g, ' ')}{ev.material_title ? ` — ${ev.material_title}` : ''}</span>
                  <span className="text-slate-400 dark:text-slate-500">{new Date(ev.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={TrendingUp} title="No activity yet" />
          )}
        </Card>

        {/* Intervention notes */}
        <Card title="Intervention notes" description="Private staff case log — not visible to parents or students">
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={3}
              aria-label="Intervention note"
              placeholder="e.g. Flagged high-risk — called parent 2026-07-10, agreed weekly check-ins."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:[color-scheme:dark] px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
            />
            <div className="flex justify-end">
              <Button type="submit" loading={submitting} disabled={!noteBody.trim()}>Add note</Button>
            </div>
          </form>
          <ul className="mt-4 space-y-3">
            {notes.length === 0 ? (
              <li className="text-sm text-slate-400 dark:text-slate-500">No notes yet.</li>
            ) : (
              notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-[#f8fafc] dark:bg-slate-800/60 px-3 py-2">
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {n.author_name ?? 'Admin'} · {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}
