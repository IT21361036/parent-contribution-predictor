import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShieldAlert, TrendingUp, TrendingDown, FileText, Download, Trash2, Upload } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Avatar } from '../../components/ui/Avatar'
import { Alert } from '../../components/ui/Alert'
import { Field, Input } from '../../components/ui/Field'
import { apiGet, apiPost, apiUpload, apiDelete } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { RISK_META } from '../../lib/risk'
import type { StudentDetail, Prediction, InterventionNote, ReportCard } from '../../lib/types'

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

        {/* Report cards */}
        {id && <ReportCardsCard childId={id} />}

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

function ReportCardsCard({ childId }: { childId: string }) {
  const [cards, setCards] = useState<ReportCard[]>([])
  const [term, setTerm] = useState('')
  const [title, setTitle] = useState('')
  const [fileKey, setFileKey] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const toast = useToast()

  async function load() {
    try {
      setCards(await apiGet<ReportCard[]>(`/admin/students/${childId}/report-cards`))
    } catch {
      setCards([])
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId])

  async function upload(e: FormEvent) {
    e.preventDefault()
    if (!term.trim() || !file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('term', term.trim())
      if (title.trim()) fd.append('title', title.trim())
      fd.append('file', file)
      await apiUpload(`/admin/students/${childId}/report-cards`, fd)
      setTerm('')
      setTitle('')
      setFile(null)
      setFileKey((k) => k + 1)
      await load()
      toast.success('Report card uploaded — parents notified')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function download(rc: ReportCard) {
    try {
      const { url } = await apiGet<{ url: string }>(`/admin/report-cards/${rc.id}/download`)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open file')
    }
  }

  async function remove(rc: ReportCard) {
    try {
      await apiDelete(`/admin/report-cards/${rc.id}`)
      await load()
      toast.success('Report card deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <Card title="Report cards" description="Upload a PDF per term — parents can view and download it">
      <form onSubmit={upload} className="grid gap-3 sm:grid-cols-2">
        <Field label="Term">
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. 2025 Term 1" required />
        </Field>
        <Field label="Title (optional)">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mid-year report" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="PDF file">
            <Input
              key={fileKey}
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </Field>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" loading={uploading} disabled={!term.trim() || !file} icon={<Upload className="size-4" />}>
            Upload report card
          </Button>
        </div>
      </form>

      <ul className="mt-5 divide-y divide-slate-100 dark:divide-slate-800">
        {cards.length === 0 ? (
          <li className="py-2 text-sm text-slate-400 dark:text-slate-500">No report cards uploaded yet.</li>
        ) : (
          cards.map((rc) => (
            <li key={rc.id} className="py-3 flex items-center gap-3">
              <div className="size-9 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {rc.title || rc.term}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {rc.term} · {new Date(rc.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => download(rc)}
                className="text-slate-400 hover:text-[#4665f2] dark:hover:text-[#93a8ff] p-1.5 rounded-lg hover:bg-[#eef2fe] dark:hover:bg-[#1c2a63] transition-colors"
                title="Download"
              >
                <Download className="size-4" />
              </button>
              <button
                onClick={() => remove(rc)}
                className="text-slate-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                title="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))
        )}
      </ul>
    </Card>
  )
}
