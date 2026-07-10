import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  Download,
  FileQuestion,
  FileText,
  Plus,
  Presentation,
  Search,
  Upload,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatCard } from '../../components/ui/StatCard'
import { FilterChips } from '../../components/ui/FilterChips'
import { Field, Input, Select } from '../../components/ui/Field'
import { Alert } from '../../components/ui/Alert'
import { Spinner } from '../../components/ui/Spinner'
import { BarsChart } from '../../components/charts/BarsChart'
import { useToast } from '../../contexts/ToastContext'
import { apiGet, apiPost, apiUpload } from '../../lib/api'
import type {
  LearningMaterial,
  MaterialType,
  Quiz,
  QuizAttemptWithChild,
  QuizQuestionInput,
  QuizWithQuestions,
  QuestionType,
  Subject,
} from '../../lib/types'

const MATERIAL_TYPES: MaterialType[] = ['document', 'video', 'exam_paper', 'slide']
const MATERIAL_ICON: Record<MaterialType, LucideIcon> = {
  document: FileText,
  video: Video,
  exam_paper: FileQuestion,
  slide: Presentation,
}

// The former teacher content tools, now an admin-only content-management area.
// `section` is driven by the Admin portal sidebar ('materials' | 'quizzes'), so
// this component renders no navigation of its own.
export function ContentManager({ section }: { section: 'materials' | 'quizzes' }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [materials, setMaterials] = useState<LearningMaterial[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [subjectModalOpen, setSubjectModalOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [quizModalOpen, setQuizModalOpen] = useState(false)
  const [viewQuiz, setViewQuiz] = useState<QuizWithQuestions | null>(null)
  const [resultsQuiz, setResultsQuiz] = useState<Quiz | null>(null)
  const [materialSearch, setMaterialSearch] = useState('')
  const [materialType, setMaterialType] = useState<MaterialType | null>(null)
  const toast = useToast()

  async function refreshSubjects() {
    try {
      setSubjects(await apiGet<Subject[]>('/subjects'))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load subjects')
    }
  }

  async function refreshContent(id: string) {
    try {
      const [m, q] = await Promise.all([
        apiGet<LearningMaterial[]>(`/materials?subject_id=${id}`),
        apiGet<Quiz[]>(`/quizzes?subject_id=${id}`),
      ])
      setMaterials(m)
      setQuizzes(q)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load subject content')
    }
  }

  useEffect(() => {
    refreshSubjects()
  }, [])

  useEffect(() => {
    if (subjectId) refreshContent(subjectId)
    else {
      setMaterials([])
      setQuizzes([])
    }
  }, [subjectId])

  async function download(id: string) {
    try {
      const { url } = await apiGet<{ url: string }>(`/materials/${id}/download`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to get download link')
    }
  }

  async function viewQuizDetail(id: string) {
    try {
      setViewQuiz(await apiGet<QuizWithQuestions>(`/quizzes/${id}`))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load quiz')
    }
  }

  const totalAttempts = quizzes.reduce((sum, q) => sum + (q.attempt_count ?? 0), 0)
  const totalMarks = quizzes.reduce((sum, q) => sum + (q.total_marks ?? 0), 0)

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase()
    return materials.filter((m) => {
      if (materialType && m.type !== materialType) return false
      if (!q) return true
      return m.title.toLowerCase().includes(q)
    })
  }, [materials, materialSearch, materialType])

  return (
    <>
      {loadError && <Alert className="mb-4">{loadError}</Alert>}

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <Field label="Subject">
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Select a subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.grade_level ? `(${s.grade_level})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setSubjectModalOpen(true)}>
            New subject
          </Button>
        </div>
      </Card>

      {!subjectId ? (
        <EmptyState
          icon={BookOpen}
          title="Select a subject"
          description="Choose or create a subject above to manage its materials and quizzes."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { icon: FileText, label: 'Materials', value: materials.length, accent: 'indigo' as const },
              { icon: ClipboardList, label: 'Quizzes', value: quizzes.length, accent: 'teal' as const },
              { icon: Users, label: 'Student attempts', value: totalAttempts, accent: 'amber' as const },
              { icon: Award, label: 'Marks available', value: totalMarks, accent: 'violet' as const },
            ].map((s, i) => (
              <StatCard
                key={s.label}
                icon={s.icon}
                label={s.label}
                value={s.value}
                accent={s.accent}
                className="animate-card-in"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>

          {section === 'materials' ? (
            <Card
              title="Materials"
              description={`${filteredMaterials.length} of ${materials.length} shown`}
              actions={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 dark:text-slate-500" />
                    <input
                      value={materialSearch}
                      onChange={(e) => setMaterialSearch(e.target.value)}
                      placeholder="Search materials"
                      className="w-44 sm:w-56 rounded-lg border border-[#e2e8f0] dark:border-slate-800 pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4665f2]"
                    />
                  </div>
                  <Button size="sm" icon={<Upload className="size-4" />} onClick={() => setUploadOpen(true)}>
                    Upload
                  </Button>
                </div>
              }
            >
              <div className="mb-3">
                <FilterChips options={MATERIAL_TYPES} active={materialType} onChange={setMaterialType} />
              </div>
              {filteredMaterials.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={materials.length === 0 ? 'No materials yet' : 'No matches'}
                  description={
                    materials.length === 0
                      ? 'Upload a document, video, exam paper, or slide deck.'
                      : 'Try a different search, or clear the type filter above.'
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMaterials.map((m, i) => {
                    const Icon = MATERIAL_ICON[m.type]
                    return (
                      <li
                        key={m.id}
                        className="py-3 flex items-center justify-between gap-3 group animate-row-in"
                        style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
                            <Icon className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{m.title}</p>
                            <Badge>{m.type.replace('_', ' ')}</Badge>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={() => download(m.id)}>
                          Download
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          ) : (
            <div className="space-y-6">
              <Card
                title="Quizzes"
                description={`${quizzes.length} created`}
                actions={
                  <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setQuizModalOpen(true)}>
                    Create quiz
                  </Button>
                }
              >
                {quizzes.length === 0 ? (
                  <EmptyState icon={ClipboardList} title="No quizzes yet" description="Build a quiz with multiple-choice or short-answer questions." />
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {quizzes.map((q, i) => (
                      <li
                        key={q.id}
                        className="py-3 flex items-center justify-between gap-3 animate-row-in"
                        style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-9 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
                            <ClipboardList className="size-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{q.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {q.total_marks ?? 0} marks · {q.attempt_count ?? 0} attempt{(q.attempt_count ?? 0) === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => viewQuizDetail(q.id)}>
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<BarChart3 className="size-4" />}
                            onClick={() => setResultsQuiz(q)}
                            disabled={(q.attempt_count ?? 0) === 0}
                          >
                            Results
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {quizzes.some((q) => (q.attempt_count ?? 0) > 0) && (
                <Card title="Attempts per quiz" description="How many times students have taken each quiz">
                  <BarsChart
                    data={quizzes.map((q) => ({ label: q.title, value: q.attempt_count ?? 0 }))}
                    height={200}
                  />
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <CreateSubjectModal
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        onCreated={async (s) => {
          await refreshSubjects()
          setSubjectId(s.id)
          toast.success('Subject created')
        }}
      />
      {subjectId && (
        <>
          <UploadMaterialModal
            open={uploadOpen}
            subjectId={subjectId}
            onClose={() => setUploadOpen(false)}
            onUploaded={() => {
              refreshContent(subjectId)
              toast.success('Material uploaded')
            }}
          />
          <CreateQuizModal
            open={quizModalOpen}
            subjectId={subjectId}
            onClose={() => setQuizModalOpen(false)}
            onCreated={() => {
              refreshContent(subjectId)
              toast.success('Quiz created')
            }}
          />
        </>
      )}
      <ViewQuizModal quiz={viewQuiz} onClose={() => setViewQuiz(null)} />
      <QuizResultsModal quiz={resultsQuiz} onClose={() => setResultsQuiz(null)} />
    </>
  )
}

function QuizResultsModal({ quiz, onClose }: { quiz: Quiz | null; onClose: () => void }) {
  const [attempts, setAttempts] = useState<QuizAttemptWithChild[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!quiz) {
      setAttempts(null)
      setError(null)
      return
    }
    apiGet<QuizAttemptWithChild[]>(`/quizzes/${quiz.id}/attempts`)
      .then(setAttempts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load results'))
  }, [quiz])

  const percents = (attempts ?? [])
    .filter((a) => a.max_score)
    .map((a) => Math.round(((a.score ?? 0) / (a.max_score || 1)) * 100))
  const avg = percents.length ? Math.round(percents.reduce((s, p) => s + p, 0) / percents.length) : null
  const best = percents.length ? Math.max(...percents) : null

  return (
    <Modal open={!!quiz} onClose={onClose} title={quiz ? `Results — ${quiz.title}` : ''} size="lg">
      {error && <Alert>{error}</Alert>}
      {!error && !attempts && (
        <div className="py-8 flex justify-center">
          <Spinner />
        </div>
      )}
      {attempts && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={Users} label="Attempts" value={attempts.length} accent="indigo" />
            <StatCard icon={BarChart3} label="Average" value={avg !== null ? `${avg}%` : '—'} accent="teal" />
            <StatCard icon={Award} label="Best" value={best !== null ? `${best}%` : '—'} accent="violet" />
          </div>
          {attempts.length === 0 ? (
            <EmptyState icon={Users} title="No attempts yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-slate-500 dark:text-slate-400 text-left">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Score</th>
                    <th className="py-2 pr-4 font-medium">Percent</th>
                    <th className="py-2 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {attempts.map((a) => {
                    const pct = a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : null
                    return (
                      <tr key={a.id} className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors">
                        <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-200">{a.child_name ?? 'Unknown'}</td>
                        <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-300">
                          {a.score} / {a.max_score}
                        </td>
                        <td className="py-2.5 pr-4">
                          {pct !== null ? (
                            <Badge tone={pct >= 75 ? 'emerald' : pct >= 40 ? 'amber' : 'red'}>{pct}%</Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 text-slate-500 dark:text-slate-400">{new Date(a.submitted_at).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function CreateSubjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (s: Subject) => void
}) {
  const [name, setName] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const s = await apiPost<Subject>('/subjects', { name, grade_level: gradeLevel || null })
      setName('')
      setGradeLevel('')
      onClose()
      onCreated(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create subject')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New subject">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Grade level (optional)">
          <Input placeholder="e.g. O/L, Grade 11" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function UploadMaterialModal({
  open,
  subjectId,
  onClose,
  onUploaded,
}: {
  open: boolean
  subjectId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<MaterialType>('document')
  const [durationSeconds, setDurationSeconds] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Choose a file to upload')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('type', type)
      formData.append('subject_id', subjectId)
      if (description) formData.append('description', description)
      if (type === 'video' && durationSeconds) formData.append('duration_seconds', durationSeconds)
      formData.append('file', file)

      await apiUpload('/materials', formData)
      setTitle('')
      setDescription('')
      setDurationSeconds('')
      setFile(null)
      onClose()
      onUploaded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload material')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload material">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as MaterialType)}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'video' && (
          <Field label="Duration (seconds, optional)">
            <Input type="number" min={0} value={durationSeconds} onChange={(e) => setDurationSeconds(e.target.value)} />
          </Field>
        )}
        <Field label="File">
          <input
            type="file"
            className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-[#eef2fe] dark:file:bg-[#1c2a63] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-900 dark:file:text-slate-100 hover:file:bg-[#dbe4fd] dark:hover:file:bg-[#2a3a7a]"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
        </Field>

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Upload
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function emptyQuestion(): QuizQuestionInput {
  return { question_text: '', type: 'mcq', options: ['', ''], correct_answer: '', marks: 1 }
}

function CreateQuizModal({
  open,
  subjectId,
  onClose,
  onCreated,
}: {
  open: boolean
  subjectId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [questions, setQuestions] = useState<QuizQuestionInput[]>([emptyQuestion()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateQuestion(index: number, patch: Partial<QuizQuestionInput>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  function updateOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qIndex ? { ...q, options: (q.options ?? []).map((o, j) => (j === oIndex ? value : o)) } : q))
    )
  }

  function addOption(qIndex: number) {
    setQuestions((qs) => qs.map((q, i) => (i === qIndex ? { ...q, options: [...(q.options ?? []), ''] } : q)))
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) => (i === qIndex ? { ...q, options: (q.options ?? []).filter((_, j) => j !== oIndex) } : q))
    )
  }

  function changeType(index: number, type: QuestionType) {
    updateQuestion(index, { type, options: type === 'mcq' ? ['', ''] : null, correct_answer: '' })
  }

  function reset() {
    setTitle('')
    setDueDate('')
    setQuestions([emptyQuestion()])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const cleaned = questions.map((q) => ({
        ...q,
        options: q.type === 'mcq' ? (q.options ?? []).filter((o) => o.trim() !== '') : null,
      }))
      await apiPost('/quizzes', {
        title,
        subject_id: subjectId,
        questions: cleaned,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      })
      reset()
      onClose()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quiz')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create quiz" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Quiz title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        <Field label="Due date (optional)" hint="Parents are reminded when a quiz is due within 3 days and not yet attempted.">
          <Input type="datetime-local" className="dark:[color-scheme:dark]" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>

        <div className="space-y-4">
          {questions.map((q, qIndex) => (
            <div key={qIndex} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Question {qIndex + 1}</span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIndex))}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                  >
                    Remove question
                  </button>
                )}
              </div>

              <Field label="Question text">
                <Input value={q.question_text} onChange={(e) => updateQuestion(qIndex, { question_text: e.target.value })} required />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type">
                  <Select value={q.type} onChange={(e) => changeType(qIndex, e.target.value as QuestionType)}>
                    <option value="mcq">Multiple choice (auto-graded)</option>
                    <option value="short_answer">Short answer (manual grading)</option>
                  </Select>
                </Field>
                <Field label="Marks">
                  <Input
                    type="number"
                    min={1}
                    value={q.marks}
                    onChange={(e) => updateQuestion(qIndex, { marks: Number(e.target.value) })}
                  />
                </Field>
              </div>

              {q.type === 'mcq' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Options</label>
                  {(q.options ?? []).map((opt, oIndex) => (
                    <div key={oIndex} className="flex items-center gap-2">
                      <Input
                        value={opt}
                        onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                        placeholder={`Option ${oIndex + 1}`}
                        required
                      />
                      {(q.options?.length ?? 0) > 2 && (
                        <button
                          type="button"
                          onClick={() => removeOption(qIndex, oIndex)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 shrink-0"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOption(qIndex)}
                    className="text-xs text-[#4665f2] dark:text-[#93a8ff] hover:text-[#3550d4] dark:hover:text-[#a5b6ff] font-medium"
                  >
                    + Add option
                  </button>

                  <Field label="Correct answer">
                    <Select value={q.correct_answer ?? ''} onChange={(e) => updateQuestion(qIndex, { correct_answer: e.target.value })} required>
                      <option value="" disabled>
                        Select the correct option
                      </option>
                      {(q.options ?? [])
                        .filter((o) => o.trim() !== '')
                        .map((opt, i) => (
                          <option key={i} value={opt}>
                            {opt}
                          </option>
                        ))}
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
          className="text-sm text-[#4665f2] dark:text-[#93a8ff] hover:text-[#3550d4] dark:hover:text-[#a5b6ff] font-medium"
        >
          + Add another question
        </button>

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create quiz
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ViewQuizModal({ quiz, onClose }: { quiz: QuizWithQuestions | null; onClose: () => void }) {
  return (
    <Modal open={!!quiz} onClose={onClose} title={quiz?.title ?? ''} description={quiz ? `${quiz.total_marks ?? 0} marks` : undefined}>
      {quiz && (
        <ol className="space-y-3 list-decimal list-inside">
          {quiz.questions.map((q) => (
            <li key={q.id} className="text-sm text-slate-700 dark:text-slate-300">
              {q.question_text}{' '}
              <span className="text-xs text-slate-400 dark:text-slate-500">({q.type === 'mcq' ? 'MCQ' : 'short answer'}, {q.marks} marks)</span>
              {q.type === 'mcq' && q.options && (
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  {q.options.map((opt, i) => (
                    <li key={i} className={opt === q.correct_answer ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-slate-500 dark:text-slate-400'}>
                      {opt}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
