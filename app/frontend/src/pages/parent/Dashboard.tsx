import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bell,
  Clock,
  Download,
  Eye,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  MousePointerClick,
  PlayCircle,
  ScanFace,
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
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { StatCard } from '../../components/ui/StatCard'
import { FilterChips } from '../../components/ui/FilterChips'
import { Field, Select } from '../../components/ui/Field'
import { Alert } from '../../components/ui/Alert'
import { TrendChart } from '../../components/charts/TrendChart'
import { AttentionPanel } from '../../components/attention/AttentionPanel'
import { LampGauge } from '../../components/ui/LampGauge'
import { Pagination, usePagination } from '../../components/ui/Pagination'
import { apiGet, apiPost } from '../../lib/api'
import { useToast } from '../../contexts/ToastContext'
import { averagePercent, dailyCounts, scoreTrend } from '../../lib/chartData'
import { RISK_META } from '../../lib/risk'
import type {
  ActivityAction,
  AppNotification,
  AttentionHistoryItem,
  EngagementIndex,
  EngagementPoint,
  LinkedChild,
  MonitoringSession,
  NotificationList,
  Prediction,
  QuizAttempt,
  ReportCard,
  StudentActivity,
} from '../../lib/types'

const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'activity', label: 'Activity History', icon: History },
  { key: 'quizzes', label: 'Quiz Scores', icon: ListChecks },
  { key: 'reportcards', label: 'Report Cards', icon: FileText },
  { key: 'sessions', label: 'Monitoring Sessions', icon: Clock },
  { key: 'attention', label: 'Attention History', icon: ScanFace },
]

const NOTIFICATION_ICON: Record<AppNotification['type'], LucideIcon> = {
  quiz_result: ListChecks,
  quiz_due: Clock,
  report_card: FileText,
  risk_alert: ShieldAlert,
}

const ACTION_ICON: Record<ActivityAction, LucideIcon> = {
  view: Eye,
  download: Download,
  video_watch: PlayCircle,
  quiz_start: MousePointerClick,
  quiz_submit: Send,
}
const ACTIONS: ActivityAction[] = ['view', 'download', 'video_watch', 'quiz_start', 'quiz_submit']

type Section = 'overview' | 'notifications' | 'activity' | 'quizzes' | 'reportcards' | 'sessions' | 'attention'

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
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [reportCards, setReportCards] = useState<ReportCard[]>([])
  const [attentionHistory, setAttentionHistory] = useState<AttentionHistoryItem[]>([])
  const [error, setError] = useState<string | null>(null)

  async function refreshAttentionHistory() {
    try {
      setAttentionHistory(await apiGet<AttentionHistoryItem[]>('/parent/attention-history'))
    } catch {
      // best-effort — history is informational, don't block the portal
    }
  }

  async function refreshSessions() {
    try {
      setSessions(await apiGet<MonitoringSession[]>('/parent/sessions'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring sessions')
    }
  }

  // Notifications are parent-wide (not per-child). The GET also lazily generates
  // any due-quiz reminders, so calling it on load keeps the badge current.
  async function refreshNotifications() {
    try {
      const res = await apiGet<NotificationList>('/notifications')
      setNotifications(res.items)
      setUnread(res.unread)
    } catch {
      // best-effort — a failure here shouldn't block the rest of the portal
    }
  }

  useEffect(() => {
    apiGet<LinkedChild[]>('/parent/children')
      .then(setChildren)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load linked children'))
    refreshSessions()
    refreshNotifications()
    refreshAttentionHistory()
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
      setReportCards([])
      return
    }
    apiGet<ReportCard[]>(`/parent/children/${childId}/report-cards`)
      .then(setReportCards)
      .catch(() => setReportCards([]))
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
    if (next === 'attention') refreshAttentionHistory()
  }

  // Clicking a notification marks it read (the engagement scoring hook) and
  // deep-links to the section it concerns.
  async function openNotification(n: AppNotification) {
    if (!n.read_at) {
      try {
        await apiPost(`/notifications/${n.id}/read`, {})
      } catch {
        // non-blocking — still navigate even if the read call failed
      }
      await refreshNotifications()
    }
    if (n.child_id && children.some((c) => c.child_id === n.child_id)) {
      setChildId(n.child_id)
    }
    if (n.type === 'report_card') setSection('reportcards')
    else if (n.type === 'quiz_result' || n.type === 'quiz_due') setSection('quizzes')
    else if (n.type === 'risk_alert') setSection('overview')
  }

  async function markAllRead() {
    try {
      await apiPost('/notifications/read-all', {})
    } finally {
      await refreshNotifications()
    }
  }

  const selectedChild = children.find((c) => c.child_id === childId)
  const SECTION_TITLE: Record<Section, string> = {
    overview: 'Overview',
    notifications: 'Notifications',
    activity: 'Activity History',
    quizzes: 'Quiz Scores',
    reportcards: 'Report Cards',
    sessions: 'Monitoring Sessions',
    attention: 'Attention History',
  }

  const navItems = NAV.map((item) =>
    item.key === 'notifications' && unread > 0 ? { ...item, badge: unread } : item,
  )

  return (
    <PortalLayout
      title={selectedChild ? `${SECTION_TITLE[section]} — ${selectedChild.full_name}` : 'Parent Portal'}
      navItems={navItems}
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

      {section === 'notifications' ? (
        <NotificationsSection
          items={notifications}
          unread={unread}
          onOpen={openNotification}
          onMarkAll={markAllRead}
        />
      ) : section === 'sessions' ? (
        <SessionsSection sessions={sessions} />
      ) : section === 'attention' ? (
        <AttentionHistorySection items={attentionHistory} />
      ) : !selectedChild ? (
        <EmptyState icon={Users} title="Select a child" description="Choose a linked child above to see their activity and progress." />
      ) : (
        <>
          {section === 'overview' && (
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
          {section === 'reportcards' && (
            <ReportCardsSection cards={reportCards} childName={selectedChild.full_name} />
          )}
        </>
      )}
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
      {engagement?.engagement_index != null && (
        <Card accent eyebrow="why your involvement matters">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Across our students, higher parental engagement is linked to stronger O/L performance. Your engagement index
            is{' '}
            <span className="font-semibold text-[#4F46E5] dark:text-[#A5B4FC]">
              {Math.round(engagement.engagement_index * 100)}/100
            </span>{' '}
            — every check-in and monitored session counts.
          </p>
        </Card>
      )}

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
    <Card accent eyebrow="the lamp" title="Your engagement index" description="Transparent parental-involvement score">
      {pct == null ? (
        <EmptyState icon={Gauge} title="No engagement recorded yet" />
      ) : (
        <>
          <div className="flex justify-center py-1">
            <LampGauge value={(pei ?? 0)} />
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
  const { page, setPage, totalPages, pageItems } = usePagination(filtered, 8)

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
        <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {pageItems.map((a, i) => {
            const Icon = ACTION_ICON[a.action]
            return (
              <li
                key={a.id}
                className="py-3 flex items-center gap-3 animate-row-in"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="size-9 rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#A5B4FC] flex items-center justify-center shrink-0">
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
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </Card>
  )
}

function QuizzesSection({ attempts }: { attempts: QuizAttempt[] }) {
  const { page, setPage, totalPages, pageItems } = usePagination(attempts, 8)
  return (
    <Card title="Quiz scores" description={`${attempts.length} attempts`}>
      {attempts.length === 0 ? (
        <EmptyState icon={ListChecks} title="No quizzes attempted yet" />
      ) : (
        <div className="-mx-5 -mb-5">
          <div className="overflow-x-auto">
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
              {pageItems.map((a) => {
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
          <div className="px-5 pb-1">
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </div>
      )}
    </Card>
  )
}

function formatSeconds(total: number): string {
  if (total < 60) return `${Math.round(total)}s`
  const m = Math.floor(total / 60)
  const s = Math.round(total % 60)
  return s ? `${m}m ${s}s` : `${m}m`
}

function AttentionHistorySection({ items }: { items: AttentionHistoryItem[] }) {
  const rows = items
    .filter((i) => (i.total_seconds ?? 0) > 0)
    .map((i) => ({ ...i, pct: Math.round(((i.attentive_seconds ?? 0) / (i.total_seconds || 1)) * 100) }))
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : null
  const totalMin = Math.round(items.reduce((s, i) => s + (i.total_seconds ?? 0), 0) / 60)
  // Oldest → newest for the trend line.
  const trend = [...rows]
    .reverse()
    .map((r) => ({ label: r.recorded_at ? new Date(r.recorded_at).toLocaleDateString() : '', value: r.pct }))
  const { page, setPage, totalPages, pageItems } = usePagination(rows, 8)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: ScanFace, label: 'Runs logged', value: items.length, accent: 'blue' as const },
          { icon: Eye, label: 'Avg attentive', value: avg != null ? `${avg}%` : '—', accent: 'teal' as const },
          { icon: Clock, label: 'Total observed', value: `${totalMin}m`, accent: 'violet' as const },
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

      <Card accent eyebrow="the record" title="Attention over time" description="Every verified observation run, newest first">
        {trend.length >= 2 && (
          <div className="mb-5">
            <TrendChart data={trend} mode="line" height={200} yDomain={[0, 100]} valueFormatter={(v) => `${v}%`} />
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState
            icon={ScanFace}
            title="No attention runs logged yet"
            description="Turn on “Verify my attention” during a monitoring session — each run is recorded here so you can track your observation over time."
          />
        ) : (
          <div className="-mx-5 -mb-5">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500 dark:text-slate-400 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">When</th>
                  <th className="px-5 py-2 font-medium">Child</th>
                  <th className="px-5 py-2 font-medium">Attentive</th>
                  <th className="px-5 py-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {pageItems.map((r) => (
                  <tr key={r.id} className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors">
                    <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">
                      {r.recorded_at ? new Date(r.recorded_at).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 dark:text-slate-300">{r.child_name ?? '—'}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={r.pct >= 75 ? 'emerald' : r.pct >= 40 ? 'amber' : 'red'}>{r.pct}%</Badge>
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">
                      {formatSeconds(r.total_seconds ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="px-5 pb-1">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function SessionsSection({ sessions }: { sessions: MonitoringSession[] }) {
  const totalViews = sessions.reduce((s, x) => s + x.pages_viewed, 0)
  const totalChecks = sessions.reduce((s, x) => s + x.history_checks, 0)
  const { page, setPage, totalPages, pageItems } = usePagination(sessions, 8)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Clock, label: 'Sessions', value: sessions.length, accent: 'indigo' as const },
          { icon: Eye, label: 'Pages viewed', value: totalViews, accent: 'teal' as const },
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
          <div className="-mx-5 -mb-5">
            <div className="overflow-x-auto">
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
                {pageItems.map((s) => (
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
            <div className="px-5 pb-1">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
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

function NotificationsSection({
  items,
  unread,
  onOpen,
  onMarkAll,
}: {
  items: AppNotification[]
  unread: number
  onOpen: (n: AppNotification) => void
  onMarkAll: () => void
}) {
  const { page, setPage, totalPages, pageItems } = usePagination(items, 8)
  return (
    <Card
      title="Notifications"
      description={unread > 0 ? `${unread} unread` : 'All caught up'}
      actions={
        unread > 0 ? (
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            Mark all read
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="Quiz results, due-quiz reminders, report cards and risk alerts will appear here."
        />
      ) : (
        <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 -mt-1">
          {pageItems.map((n, i) => {
            const Icon = NOTIFICATION_ICON[n.type]
            const isUnread = !n.read_at
            return (
              <li key={n.id}>
                <button
                  onClick={() => onOpen(n)}
                  className={`w-full text-left py-3 flex items-start gap-3 transition-colors animate-row-in ${
                    isUnread ? '' : 'opacity-60'
                  }`}
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                >
                  <div className="size-9 rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#A5B4FC] flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      {n.title}
                      {isUnread && <span className="size-2 rounded-full bg-red-500 shrink-0" aria-label="unread" />}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{n.body}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </Card>
  )
}

function ReportCardsSection({ cards, childName }: { cards: ReportCard[]; childName: string | null }) {
  const toast = useToast()
  const { page, setPage, totalPages, pageItems } = usePagination(cards, 8)

  async function download(rc: ReportCard) {
    try {
      const { url } = await apiGet<{ url: string }>(`/parent/report-cards/${rc.id}/download`)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the report card')
    }
  }

  return (
    <Card title="Report cards" description={childName ? `Report cards for ${childName}` : 'Report cards'}>
      {cards.length === 0 ? (
        <EmptyState icon={FileText} title="No report cards yet" description="Report cards uploaded by the school appear here." />
      ) : (
        <>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800 -mt-1">
          {pageItems.map((rc, i) => (
            <li
              key={rc.id}
              className="py-3 flex items-center gap-3 animate-row-in"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <div className="size-9 rounded-lg bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#A5B4FC] flex items-center justify-center shrink-0">
                <FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{rc.title || rc.term}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {rc.term} · {new Date(rc.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={() => download(rc)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </Card>
  )
}
