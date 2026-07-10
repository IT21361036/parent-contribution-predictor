import { useEffect, useMemo, useState, type FormEvent, type SyntheticEvent } from 'react'
import { Radio, RadioGroup } from '@headlessui/react'
import {
  Activity,
  BookOpen,
  Download,
  Eye,
  FileQuestion,
  FileText,
  ListChecks,
  MousePointerClick,
  PlayCircle,
  Presentation,
  Send,
  TrendingUp,
  Video,
  type LucideIcon,
} from 'lucide-react'
import { PortalLayout, type NavItem } from '../../components/PortalLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatCard } from '../../components/ui/StatCard'
import { FilterChips } from '../../components/ui/FilterChips'
import { Input } from '../../components/ui/Field'
import { Alert } from '../../components/ui/Alert'
import { TrendChart } from '../../components/charts/TrendChart'
import { useToast } from '../../contexts/ToastContext'
import { apiGet, apiPost } from '../../lib/api'
import { averagePercent, scoreTrend } from '../../lib/chartData'
import type {
  ActivityAction,
  ChildQuizWithQuestions,
  LearningMaterial,
  MaterialType,
  Quiz,
  QuizAttempt,
  StudentActivity,
  Subject,
} from '../../lib/types'

const NAV: NavItem[] = [
  { key: 'learn', label: 'Learn', icon: BookOpen },
  { key: 'progress', label: 'My Progress', icon: TrendingUp },
]

const MATERIAL_TYPES: MaterialType[] = ['document', 'video', 'exam_paper', 'slide']
const MATERIAL_ICON: Record<MaterialType, LucideIcon> = {
  document: FileText,
  video: Video,
  exam_paper: FileQuestion,
  slide: Presentation,
}

const ACTION_ICON: Record<ActivityAction, LucideIcon> = {
  view: Eye,
  download: Download,
  video_watch: PlayCircle,
  quiz_start: MousePointerClick,
  quiz_submit: Send,
}

type Section = 'learn' | 'progress'

export default function ChildDashboard() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [section, setSection] = useState<Section>('learn')
  const [materials, setMaterials] = useState<LearningMaterial[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [activity, setActivity] = useState<StudentActivity[]>([])
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [activeQuiz, setActiveQuiz] = useState<ChildQuizWithQuestions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function refreshProgress() {
    try {
      const [a, at] = await Promise.all([
        apiGet<StudentActivity[]>('/activity/me'),
        apiGet<QuizAttempt[]>('/quizzes/attempts/me'),
      ])
      setActivity(a)
      setAttempts(at)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load progress')
    }
  }

  useEffect(() => {
    apiGet<Subject[]>('/subjects')
      .then(setSubjects)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load subjects'))
    refreshProgress()
  }, [])

  useEffect(() => {
    if (!subjectId) {
      setMaterials([])
      setQuizzes([])
      return
    }
    apiGet<LearningMaterial[]>(`/materials?subject_id=${subjectId}`)
      .then(setMaterials)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load materials'))
    apiGet<Quiz[]>(`/quizzes?subject_id=${subjectId}`)
      .then(setQuizzes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load quizzes'))
  }, [subjectId])

  async function startQuiz(quizId: string) {
    try {
      await apiPost('/activity', { action: 'quiz_start' })
      setActiveQuiz(await apiGet<ChildQuizWithQuestions>(`/quizzes/${quizId}`))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load quiz')
    }
  }

  // Best previous score % per quiz, so the quiz list can show it.
  const bestScores = useMemo(() => {
    const best = new Map<string, number>()
    for (const a of attempts) {
      if (!a.max_score) continue
      const pct = Math.round(((a.score ?? 0) / a.max_score) * 100)
      const prev = best.get(a.quiz_id)
      if (prev === undefined || pct > prev) best.set(a.quiz_id, pct)
    }
    return best
  }, [attempts])

  return (
    <PortalLayout
      title="My Learning"
      subtitle="Study your subjects and track your progress"
      navItems={NAV}
      activeKey={section}
      onNavigate={(k) => setSection(k as Section)}
    >
      {error && <Alert className="mb-4">{error}</Alert>}

      {section === 'learn' && (
        <>
          {subjects.length === 0 ? (
            <EmptyState icon={BookOpen} title="No subjects yet" description="Your teachers haven't added any subjects yet — check back soon." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
              {subjects.map((s, i) => {
                const active = subjectId === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSubjectId(active ? '' : s.id)}
                    style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                    className={`animate-card-in text-left rounded-xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                      active ? 'border-[#4665f2] bg-[#eef2fe] dark:bg-[#1c2a63] ring-2 ring-[#4665f2]/30' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div
                      className={`size-9 rounded-lg flex items-center justify-center mb-2 ${
                        active ? 'bg-[#4665f2] text-white' : 'bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff]'
                      }`}
                    >
                      <BookOpen className="size-5" />
                    </div>
                    <p className={`text-sm font-semibold truncate ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-800 dark:text-slate-200'}`}>{s.name}</p>
                    <p className={`text-xs mt-0.5 ${active ? 'text-[#4665f2] dark:text-[#93a8ff]' : 'text-slate-400 dark:text-slate-500'}`}>
                      {s.grade_level ?? 'All grades'}
                    </p>
                  </button>
                )
              })}
            </div>
          )}

          {!subjectId ? (
            subjects.length > 0 && (
              <EmptyState icon={BookOpen} title="Pick a subject" description="Tap a subject card above to see its materials and quizzes." />
            )
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <MaterialsCard materials={materials} onActivityLogged={refreshProgress} />
              <QuizzesCard quizzes={quizzes} bestScores={bestScores} onStart={startQuiz} />
            </div>
          )}
        </>
      )}

      {section === 'progress' && <ProgressSection activity={activity} attempts={attempts} />}

      <QuizTakerModal
        quiz={activeQuiz}
        onClose={() => setActiveQuiz(null)}
        onSubmitted={refreshProgress}
      />
    </PortalLayout>
  )
}

function MaterialsCard({
  materials,
  onActivityLogged,
}: {
  materials: LearningMaterial[]
  onActivityLogged: () => void
}) {
  const [type, setType] = useState<MaterialType | null>(null)
  const filtered = type ? materials.filter((m) => m.type === type) : materials

  return (
    <Card title="Materials" description={`${filtered.length} of ${materials.length} shown`}>
      <div className="mb-3">
        <FilterChips options={MATERIAL_TYPES} active={type} onChange={setType} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={materials.length === 0 ? 'No materials in this subject yet' : 'No matches'}
          description={materials.length === 0 ? undefined : 'Clear the type filter above.'}
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((m) => (
            <MaterialRow key={m.id} material={m} onActivityLogged={onActivityLogged} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function MaterialRow({ material, onActivityLogged }: { material: LearningMaterial; onActivityLogged: () => void }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const Icon = MATERIAL_ICON[material.type]

  async function open() {
    setError(null)
    try {
      const { url } = await apiGet<{ url: string }>(`/materials/${material.id}/download`)
      if (material.type === 'video') {
        setVideoUrl(url)
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      await apiPost('/activity', { material_id: material.id, action: 'download' })
      onActivityLogged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open material')
    }
  }

  function logWatchProgress(e: SyntheticEvent<HTMLVideoElement>) {
    const video = e.currentTarget
    if (!video.duration) return
    apiPost('/activity', {
      material_id: material.id,
      action: 'video_watch',
      time_spent_seconds: Math.round(video.currentTime),
      watch_percent: Math.min(100, (video.currentTime / video.duration) * 100),
    }).then(onActivityLogged)
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-9 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{material.title}</p>
            <Badge>{material.type.replace('_', ' ')}</Badge>
          </div>
        </div>
        {!videoUrl && (
          <Button
            variant="ghost"
            size="sm"
            icon={material.type === 'video' ? <PlayCircle className="size-4" /> : <Download className="size-4" />}
            onClick={open}
          >
            {material.type === 'video' ? 'Watch' : 'Open'}
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      {videoUrl && (
        <video
          className="mt-2 w-full rounded-lg"
          src={videoUrl}
          controls
          autoPlay
          onPause={logWatchProgress}
          onEnded={logWatchProgress}
        />
      )}
    </li>
  )
}

function QuizzesCard({
  quizzes,
  bestScores,
  onStart,
}: {
  quizzes: Quiz[]
  bestScores: Map<string, number>
  onStart: (id: string) => void
}) {
  return (
    <Card title="Quizzes" description={`${quizzes.length} available`}>
      {quizzes.length === 0 ? (
        <EmptyState icon={ListChecks} title="No quizzes in this subject yet" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {quizzes.map((q) => {
            const best = bestScores.get(q.id)
            return (
              <li key={q.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
                    <ListChecks className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{q.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      {q.total_marks ?? 0} marks
                      {best !== undefined && (
                        <Badge tone={best >= 75 ? 'emerald' : best >= 40 ? 'amber' : 'red'}>best {best}%</Badge>
                      )}
                    </p>
                  </div>
                </div>
                <Button size="sm" onClick={() => onStart(q.id)}>
                  {best !== undefined ? 'Retake' : 'Take quiz'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function QuizTakerModal({
  quiz,
  onClose,
  onSubmitted,
}: {
  quiz: ChildQuizWithQuestions | null
  onClose: () => void
  onSubmitted: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizAttempt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function handleClose() {
    onClose()
    setTimeout(() => {
      setAnswers({})
      setResult(null)
      setError(null)
    }, 200)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!quiz) return
    setError(null)
    setSubmitting(true)
    try {
      const attempt = await apiPost<QuizAttempt>(`/quizzes/${quiz.id}/attempts`, {
        answers: Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })),
      })
      setResult(attempt)
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quiz')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={!!quiz} onClose={handleClose} title={quiz?.title ?? ''} size="lg">
      {quiz && (
        <>
          {result ? (
            <div className="text-center py-4">
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">
                {result.score} / {result.max_score}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Auto-graded score. Short-answer questions (if any) are graded separately by your teacher.
              </p>
              <Button className="mt-4" onClick={handleClose}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {quiz.questions.map((q, i) => (
                <div key={q.id} className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3">
                    {i + 1}. {q.question_text} <span className="text-xs text-slate-400 dark:text-slate-500">({q.marks} marks)</span>
                  </p>
                  {q.type === 'mcq' ? (
                    <RadioGroup value={answers[q.id] ?? ''} onChange={(val) => setAnswers((a) => ({ ...a, [q.id]: val }))}>
                      <div className="space-y-2">
                        {(q.options ?? []).map((opt, oi) => (
                          <Radio key={oi} value={opt} className="cursor-pointer block">
                            {({ checked }) => (
                              <div
                                className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                  checked ? 'border-[#4665f2] bg-[#eef2fe] dark:bg-[#1c2a63] text-slate-900 dark:text-slate-100' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <span
                                  className={`size-4 rounded-full border flex items-center justify-center shrink-0 ${
                                    checked ? 'border-[#4665f2]' : 'border-slate-300 dark:border-slate-600'
                                  }`}
                                >
                                  {checked && <span className="size-2 rounded-full bg-[#4665f2]" />}
                                </span>
                                {opt}
                              </div>
                            )}
                          </Radio>
                        ))}
                      </div>
                    </RadioGroup>
                  ) : (
                    <Input value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                  )}
                </div>
              ))}

              {error && <Alert>{error}</Alert>}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" loading={submitting}>
                  Submit answers
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  )
}

function ProgressSection({ activity, attempts }: { activity: StudentActivity[]; attempts: QuizAttempt[] }) {
  const avgScore = averagePercent(attempts)
  const scoreSeries = scoreTrend(attempts)

  const stats = [
    { icon: Activity, label: 'Activity events', value: activity.length, accent: 'indigo' as const },
    { icon: ListChecks, label: 'Quizzes attempted', value: attempts.length, accent: 'teal' as const },
    { icon: TrendingUp, label: 'Average score', value: avgScore !== null ? `${avgScore}%` : '—', accent: 'violet' as const },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s, i) => (
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

      <Card title="Score trend" description="Your quiz scores over time">
        {scoreSeries.length === 0 ? (
          <EmptyState icon={TrendingUp} title="No graded quizzes yet" description="Take a quiz to start your trend line." />
        ) : (
          <TrendChart data={scoreSeries} mode="line" height={210} yDomain={[0, 100]} valueFormatter={(v) => `${v}%`} />
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent activity">
          {activity.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No activity yet" description="Open a material or take a quiz to get started." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {activity.slice(0, 10).map((a, i) => {
                const Icon = ACTION_ICON[a.action]
                return (
                  <li
                    key={a.id}
                    className="py-2.5 flex items-center gap-3 animate-row-in"
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  >
                    <div className="size-8 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        <span className="capitalize">{a.action.replace('_', ' ')}</span>
                        {a.material_title && <span className="text-slate-500 dark:text-slate-400"> — {a.material_title}</span>}
                        {a.watch_percent != null && (
                          <span className="text-slate-500 dark:text-slate-400"> · {Math.round(a.watch_percent)}% watched</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(a.created_at).toLocaleString()}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
        <Card title="Quiz scores">
          {attempts.length === 0 ? (
            <EmptyState icon={ListChecks} title="No quizzes attempted yet" />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {attempts.map((a) => {
                const pct = a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : null
                return (
                  <li key={a.id} className="py-2.5 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{a.quiz_title ?? 'Quiz'}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(a.submitted_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {a.score} / {a.max_score}
                      </span>
                      {pct !== null && <Badge tone={pct >= 75 ? 'emerald' : pct >= 40 ? 'amber' : 'red'}>{pct}%</Badge>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
