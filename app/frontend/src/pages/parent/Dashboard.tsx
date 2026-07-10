import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Clock,
  Download,
  Eye,
  Gauge,
  History,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MousePointerClick,
  PlayCircle,
  Send,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { PortalLayout, type NavItem } from '../../components/PortalLayout'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatCard } from '../../components/ui/StatCard'
import { FilterChips } from '../../components/ui/FilterChips'
import { Field, Select } from '../../components/ui/Field'
import { Alert } from '../../components/ui/Alert'
import { TrendChart } from '../../components/charts/TrendChart'
import { AttentionPanel } from '../../components/attention/AttentionPanel'
import { apiGet, apiPost } from '../../lib/api'
import { averagePercent, dailyCounts, scoreTrend } from '../../lib/chartData'
import { RISK_META } from '../../lib/risk'
import type {
  ActivityAction,
  EngagementIndex,
  EngagementPoint,
  LinkedChild,
  MonitoringSession,
  Prediction,
  QuizAttempt,
  StudentActivity,
} from '../../lib/types'

const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'activity', label: 'Activity History', icon: History },
  { key: 'quizzes', label: 'Quiz Scores', icon: ListChecks },
  { key: 'sessions', label: 'Monitoring Sessions', icon: Clock },
]

const ACTION_ICON: Record<ActivityAction, LucideIcon> = {
  view: Eye,
  download: Download,
  video_watch: PlayCircle,
  quiz_start: MousePointerClick,
  quiz_submit: Send,
}
const ACTIONS: ActivityAction[] = ['view', 'download', 'video_watch', 'quiz_start', 'quiz_submit']

type Section = 'overview' | 'activity' | 'quizzes' | 'sessions'

export default function ParentDashboard() {
  const [children, setChildren] = useState<LinkedChild[]>([])
  const [childId, setChildId] = useState('')
  const [section, setSection] = useState<Section>('overview')
  const [activity, setActivity] = useState<StudentActivity[]>([])
  const [attempts, setAttempts] = useState<QuizAttempt[]>([])
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const [engagement, setEngagement] = useState<EngagementIndex | null>(null)
  const [engagementHistory, setEngagementHistory] = useState<EngagementPoint[]>([])
  const [sessions, setSessions] = useState<MonitoringSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refreshSessions() {
    try {
      setSessions(await apiGet<MonitoringSession[]>('/parent/sessions'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring sessions')
    }
  }

  useEffect(() => {
    apiGet<LinkedChild[]>('/parent/children')
      .then(setChildren)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load linked children'))
    refreshSessions()
  }, [])

  // A monitoring session brackets the time this parent spends looking at one
  // child's data — started when a child is selected, ended when they switch
  // to a different child or leave the page.
  useEffect(() => {
    if (!childId) {
      setActiveSessionId(null)
      return
    }

    let cancelled = false
    let localSessionId: string | null = null

    apiPost<MonitoringSession>('/parent/sessions', { child_id: childId })
      .then((session) => {
        if (cancelled) {
          apiPost(`/parent/sessions/${session.id}/end`, {}).catch(() => {})
          return
        }
        localSessionId = session.id
        setActiveSessionId(session.id)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to start monitoring session'))

    return () => {
      cancelled = true
      setActiveSessionId(null)
      if (localSessionId) {
        apiPost(`/parent/sessions/${localSessionId}/end`, {})
          .then(refreshSessions)
          .catch(() => {})
      }
    }
  }, [childId])

  useEffect(() => {
    if (!childId) {
      setActivity([])
      setAttempts([])
      setPrediction(null)
      setEngagement(null)
      setEngagementHistory([])
      return
    }
    apiGet<StudentActivity[]>(`/parent/children/${childId}/activity`)
      .then(setActivity)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load activity'))
    apiGet<QuizAttempt[]>(`/parent/children/${childId}/quiz-attempts`)
      .then(setAttempts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load quiz attempts'))
    // Prediction/engagement are best-effort: a child with no data (or no model
    // run yet) simply shows nothing rather than blocking the rest of the view.
    apiGet<Prediction>(`/predictions/${childId}`)
      .then(setPrediction)
      .catch(() => setPrediction(null))
    apiGet<EngagementIndex>(`/engagement/${childId}`)
      .then(setEngagement)
      .catch(() => setEngagement(null))
    apiGet<EngagementPoint[]>(`/engagement/${childId}/history`)
      .then(setEngagementHistory)
      .catch(() => setEngagementHistory([]))
  }, [childId])

  function ping(kind: 'page_view' | 'history_check') {
    if (!activeSessionId) return
    apiPost(`/parent/sessions/${activeSessionId}/ping`, { kind }).catch(() => {})
  }

  function selectSection(next: Section) {
    setSection(next)
    ping('page_view')
    if (next === 'activity') ping('history_check')
  }

  const selectedChild = children.find((c) => c.child_id === childId)
  const SECTION_TITLE: Record<Section, string> = {
    overview: 'Overview',
    activity: 'Activity History',
    quizzes: 'Quiz Scores',
    sessions: 'Monitoring Sessions',
  }

  return (
    <PortalLayout
      title={selectedChild ? `${SECTION_TITLE[section]} — ${selectedChild.full_name}` : 'Parent Portal'}
      navItems={NAV}
      activeKey={section}
      onNavigate={(k) => selectSection(k as Section)}
    >
      {error && <Alert className="mb-4">{error}</Alert>}

      <Card className="mb-6">
        <Field label="Child">
          <Select value={childId} onChange={(e) => setChildId(e.target.value)}>
            <option value="">Select a child</option>
            {children.map((c) => (
              <option key={c.child_id} value={c.child_id}>
                {c.full_name} {c.grade_level ? `(${c.grade_level})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        {children.length === 0 && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No child is linked to your account yet — ask an admin to link one.</p>
        )}
      </Card>

      {/* Attention verification lives at the portal level, not inside a section, so
          the camera keeps running while the parent moves between sidebar sections
          during a monitoring session. It only resets when the child (session) changes. */}
      {selectedChild && (
        <div className="mb-6">
          <AttentionPanel sessionId={activeSessionId} childName={selectedChild.full_name} />
        </div>
      )}

      {!selectedChild && section !== 'sessions' ? (
        <EmptyState icon={Users} title="Select a child" description="Choose a linked child above to see their activity and progress." />
      ) : (
        <>
          {section === 'overview' && selectedChild && (
            <OverviewSection
              child={selectedChild}
              activity={activity}
              attempts={attempts}
              prediction={prediction}
              engagement={engagement}
              engagementHistory={engagementHistory}
            />
          )}
          {section === 'activity' && <ActivitySection activity={activity} />}
          {section === 'quizzes' && <QuizzesSection attempts={attempts} />}
        </>
      )}

      {section === 'sessions' && <SessionsSection sessions={sessions} />}
    </PortalLayout>
  )
}

function OverviewSection({
  child,
  activity,
  attempts,
  prediction,
  engagement,
  engagementHistory,
}: {
  child: LinkedChild
  activity: StudentActivity[]
  attempts: QuizAttempt[]
  prediction: Prediction | null
  engagement: EngagementIndex | null
  engagementHistory: EngagementPoint[]
}) {
  const avgScore = averagePercent(attempts)
  const activitySeries = dailyCounts(activity.map((a) => a.created_at))
  const scoreSeries = scoreTrend(attempts)

  const stats = [
    { icon: Users, label: 'Child', value: child.full_name ?? '—', sub: [child.relationship, child.grade_level].filter(Boolean).join(' · ') || undefined, accent: 'indigo' as const },
    { icon: Activity, label: 'Activity events', value: activity.length, accent: 'teal' as const },
    { icon: ListChecks, label: 'Quizzes attempted', value: attempts.length, accent: 'amber' as const },
    { icon: TrendingUp, label: 'Average score', value: avgScore !== null ? `${avgScore}%` : '—', accent: 'violet' as const },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            sub={s.sub}
            accent={s.accent}
            className="animate-card-in"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PredictionCard prediction={prediction} />
        <EngagementCard engagement={engagement} history={engagementHistory} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Activity — last 14 days" description="Learning events per day">
          <TrendChart data={activitySeries} mode="area" height={210} />
        </Card>
        <Card title="Quiz score trend" description="Score % per attempt, oldest to newest">
          {scoreSeries.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No graded attempts yet" />
          ) : (
            <TrendChart data={scoreSeries} mode="line" height={210} yDomain={[0, 100]} valueFormatter={(v) => `${v}%`} />
          )}
        </Card>
      </div>
    </div>
  )
}

function PredictionCard({ prediction }: { prediction: Prediction | null }) {
  if (!prediction) {
    return (
      <Card title="Performance risk" description="Explainable O/L risk prediction">
        <EmptyState
          icon={ShieldAlert}
          title="No prediction yet"
          description="Once enough activity, grades and engagement are recorded, a risk band appears here."
        />
      </Card>
    )
  }

  const meta = RISK_META[prediction.risk_band]
  const confidence = prediction.risk_score != null ? Math.round(prediction.risk_score * 100) : null

  return (
    <Card title="Performance risk" description="Why the model predicts this band">
      <div className="flex items-center gap-3">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {confidence != null && (
          <span className="text-sm text-slate-500 dark:text-slate-400">{confidence}% confidence</span>
        )}
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{meta.description}</p>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          Top contributing factors
        </p>
        <ul className="space-y-2">
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
      </div>

      {prediction.model_version && (
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Model {prediction.model_version} · {new Date(prediction.generated_at).toLocaleDateString()}
        </p>
      )}
    </Card>
  )
}

function EngagementCard({
  engagement,
  history,
}: {
  engagement: EngagementIndex | null
  history: EngagementPoint[]
}) {
  const pei = engagement?.engagement_index
  const pct = pei != null ? Math.round(pei * 100) : null

  const trend = history
    .filter((h) => h.engagement_index != null)
    .map((h) => ({
      label: h.period ?? (h.computed_at ? new Date(h.computed_at).toLocaleDateString() : ''),
      value: Math.round((h.engagement_index ?? 0) * 100),
    }))

  return (
    <Card title="Your engagement index" description="Transparent parental-involvement score">
      {pct == null ? (
        <EmptyState icon={Gauge} title="No engagement recorded yet" />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold text-slate-800 dark:text-slate-100">{pct}</span>
            <span className="text-sm text-slate-400 dark:text-slate-500">/ 100</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Monitoring</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {(engagement?.monitoring_hours ?? 0).toFixed(1)}h
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Check-ins</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {engagement?.check_frequency ?? 0}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Attention</dt>
              <dd className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {Math.round((engagement?.avg_attention_score ?? 0.5) * 100)}%
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Lightbulb className="size-3.5" /> Weighted formula: 40% monitoring · 30% check-ins · 30% attention.
          </p>
        </>
      )}
      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          Engagement over time
        </p>
        {trend.length >= 2 ? (
          <TrendChart data={trend} mode="line" height={180} yDomain={[0, 100]} valueFormatter={(v) => `${v}%`} />
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">Not enough history yet — the trend appears after a few monitoring periods.</p>
        )}
      </div>
    </Card>
  )
}

function ActivitySection({ activity }: { activity: StudentActivity[] }) {
  const [action, setAction] = useState<ActivityAction | null>(null)
  const filtered = useMemo(() => (action ? activity.filter((a) => a.action === action) : activity), [activity, action])

  return (
    <Card title="Activity history" description={`${filtered.length} of ${activity.length} events`}>
      <div className="mb-3">
        <FilterChips options={ACTIONS} active={action} onChange={setAction} />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={activity.length === 0 ? 'No activity recorded yet' : 'No matches'}
          description={activity.length === 0 ? undefined : 'Clear the filter above to see all events.'}
        />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((a, i) => {
            const Icon = ACTION_ICON[a.action]
            return (
              <li
                key={a.id}
                className="py-3 flex items-center gap-3 animate-row-in"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="size-9 rounded-lg bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff] flex items-center justify-center shrink-0">
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-800 dark:text-slate-200">
                    <span className="capitalize font-medium">{a.action.replace('_', ' ')}</span>
                    {a.material_title && <span className="text-slate-500 dark:text-slate-400"> — {a.material_title}</span>}
                    {a.watch_percent != null && <span className="text-slate-500 dark:text-slate-400"> · {Math.round(a.watch_percent)}% watched</span>}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function QuizzesSection({ attempts }: { attempts: QuizAttempt[] }) {
  return (
    <Card title="Quiz scores" description={`${attempts.length} attempts`}>
      {attempts.length === 0 ? (
        <EmptyState icon={ListChecks} title="No quizzes attempted yet" />
      ) : (
        <div className="overflow-x-auto -mx-5 -mb-5">
          <table className="w-full text-sm">
            <thead className="text-slate-500 dark:text-slate-400 text-left">
              <tr>
                <th className="px-5 py-2 font-medium">Quiz</th>
                <th className="px-5 py-2 font-medium">Score</th>
                <th className="px-5 py-2 font-medium">Percent</th>
                <th className="px-5 py-2 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {attempts.map((a) => {
                const pct = a.max_score ? Math.round(((a.score ?? 0) / a.max_score) * 100) : null
                return (
                  <tr key={a.id} className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-slate-800 dark:text-slate-200">{a.quiz_title ?? 'Quiz'}</td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">
                      {a.score} / {a.max_score}
                    </td>
                    <td className="px-5 py-2.5">
                      {pct !== null ? <Badge tone={pct >= 75 ? 'emerald' : pct >= 40 ? 'amber' : 'red'}>{pct}%</Badge> : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{new Date(a.submitted_at).toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function SessionsSection({ sessions }: { sessions: MonitoringSession[] }) {
  const totalPages = sessions.reduce((s, x) => s + x.pages_viewed, 0)
  const totalChecks = sessions.reduce((s, x) => s + x.history_checks, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Clock, label: 'Sessions', value: sessions.length, accent: 'indigo' as const },
          { icon: Eye, label: 'Pages viewed', value: totalPages, accent: 'teal' as const },
          { icon: History, label: 'History checks', value: totalChecks, accent: 'amber' as const },
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

      <Card title="Your monitoring sessions" description={`${sessions.length} sessions logged`}>
        {sessions.length === 0 ? (
          <EmptyState icon={Clock} title="No sessions yet" description="Select a child above to start a monitoring session." />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead className="text-slate-500 dark:text-slate-400 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">Started</th>
                  <th className="px-5 py-2 font-medium">Duration</th>
                  <th className="px-5 py-2 font-medium">Pages viewed</th>
                  <th className="px-5 py-2 font-medium">History checks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-5 py-2 text-slate-700 dark:text-slate-300">{new Date(s.started_at).toLocaleString()}</td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{formatDuration(s.started_at, s.ended_at)}</td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{s.pages_viewed}</td>
                    <td className="px-5 py-2 text-slate-500 dark:text-slate-400">{s.history_checks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'in progress'
  const seconds = Math.max(0, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (seconds < 60) return `${Math.round(seconds)}s`
  return `${Math.round(seconds / 60)}m`
}
