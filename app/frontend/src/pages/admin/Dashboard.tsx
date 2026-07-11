import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Backpack, ClipboardList, Eye, FileText, Link2, Pencil, Plus, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, UserRound, Users, type LucideIcon } from 'lucide-react'
import { PortalLayout, type NavItem } from '../../components/PortalLayout'
import { ContentManager } from './ContentManager'
import { Card } from '../../components/ui/Card'
import { DonutChart } from '../../components/charts/DonutChart'
import { BarsChart } from '../../components/charts/BarsChart'
import { ROLE_COLORS } from '../../components/charts/chartTheme'
import { ACCENT, ROLE_ACCENT } from '../../lib/theme'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Badge, type Tone } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, Input, Select } from '../../components/ui/Field'
import { Alert } from '../../components/ui/Alert'
import { useToast } from '../../contexts/ToastContext'
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api'
import { RISK_META } from '../../lib/risk'
import type { ParentChildLink, PredictionRunResult, Profile, RosterRow, UserRole } from '../../lib/types'

const NAV: NavItem[] = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'links', label: 'Parent ↔ Child Links', icon: Link2 },
  { key: 'materials', label: 'Materials', icon: FileText },
  { key: 'quizzes', label: 'Quizzes', icon: ClipboardList },
  { key: 'predictions', label: 'Risk Predictions', icon: ShieldAlert },
]

const ROLES: UserRole[] = ['admin', 'parent', 'child']
const ROLE_BADGE: Record<UserRole, Tone> = { admin: 'indigo', parent: 'emerald', child: 'violet' }
const ROLE_ICON: Record<UserRole, LucideIcon> = { admin: ShieldCheck, parent: UserRound, child: Backpack }
const ROLE_LABEL: Record<UserRole, string> = { admin: 'Admins', parent: 'Parents', child: 'Children' }

type Section = 'users' | 'links' | 'materials' | 'quizzes' | 'predictions'

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  users: { title: 'Users', subtitle: 'Manage platform accounts and roles' },
  links: { title: 'Parent ↔ Child Links', subtitle: 'Grant parents monitoring access to their children' },
  materials: { title: 'Materials', subtitle: 'Upload and organise learning materials by subject' },
  quizzes: { title: 'Quizzes', subtitle: 'Create quizzes and review student attempts' },
  predictions: { title: 'Risk Predictions', subtitle: 'Explainable O/L performance-risk bands per child' },
}

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('users')
  const [users, setUsers] = useState<Profile[]>([])
  const [links, setLinks] = useState<ParentChildLink[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [viewingUser, setViewingUser] = useState<Profile | null>(null)
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null)
  const [deletingLink, setDeletingLink] = useState<ParentChildLink | null>(null)
  const [actionInProgress, setActionInProgress] = useState(false)
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null)
  const [search, setSearch] = useState('')
  const toast = useToast()

  async function refresh() {
    try {
      const [u, l] = await Promise.all([apiGet<Profile[]>('/admin/users'), apiGet<ParentChildLink[]>('/admin/links')])
      setUsers(u)
      setLinks(l)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load')
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const nameOf = (id: string) => users.find((u) => u.id === id)?.full_name ?? id
  const counts = ROLES.reduce(
    (acc, r) => ({ ...acc, [r]: users.filter((u) => u.role === r).length }),
    {} as Record<UserRole, number>
  )

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false
      if (!q) return true
      return u.full_name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
    })
  }, [users, roleFilter, search])

  async function handleDeleteUser() {
    if (!deletingUser) return
    setActionInProgress(true)
    try {
      await apiDelete(`/admin/users/${deletingUser.id}`)
      setDeletingUser(null)
      await refresh()
      toast.success('Account deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account')
    } finally {
      setActionInProgress(false)
    }
  }

  async function handleDeleteLink() {
    if (!deletingLink) return
    setActionInProgress(true)
    try {
      await apiDelete(`/admin/links/${deletingLink.id}`)
      setDeletingLink(null)
      await refresh()
      toast.success('Link removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove link')
    } finally {
      setActionInProgress(false)
    }
  }

  return (
    <PortalLayout
      title={SECTION_META[section].title}
      subtitle={SECTION_META[section].subtitle}
      navItems={NAV}
      activeKey={section}
      onNavigate={(k) => setSection(k as Section)}
      headerActions={
        section === 'users' ? (
          <Button icon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            New account
          </Button>
        ) : section === 'links' ? (
          <Button icon={<Plus className="size-4" />} onClick={() => setLinkOpen(true)}>
            Link parent &amp; child
          </Button>
        ) : undefined
      }
    >
      {section === 'predictions' ? (
        <RiskSection />
      ) : section === 'materials' || section === 'quizzes' ? (
        <ContentManager section={section} />
      ) : (
      <>
      {loadError && <Alert className="mb-4">{loadError}</Alert>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {ROLES.map((r, i) => {
          const active = roleFilter === r
          const Icon = ROLE_ICON[r]
          const accent = ACCENT[ROLE_ACCENT[r]]
          return (
            <button
              key={r}
              onClick={() => setRoleFilter(active ? null : r)}
              style={{ animationDelay: `${i * 60}ms` }}
              className={`animate-card-in relative overflow-hidden text-left rounded-xl border p-5 pb-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                active ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/30 bg-white dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${accent.tile}`}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs truncate text-slate-500 dark:text-slate-400">{ROLE_LABEL[r]}</p>
                  <p className="text-2xl font-semibold leading-tight text-slate-800 dark:text-slate-200">{counts[r]}</p>
                </div>
              </div>
              <span className={`absolute inset-x-0 bottom-0 h-1 ${accent.bar}`} />
            </button>
          )
        })}
      </div>

      {section === 'users' ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start">
        <Card
          title="All users"
          description={`${filteredUsers.length} of ${users.length} accounts`}
          actions={
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                className="w-56 rounded-lg border border-[#e2e8f0] dark:border-slate-800 pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
              />
            </div>
          }
        >
          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={users.length === 0 ? 'No users yet' : 'No matches'}
              description={
                users.length === 0
                  ? 'Create the first account to get started.'
                  : 'Try a different search, or clear the role filter above.'
              }
            />
          ) : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead className="text-slate-500 dark:text-slate-400 text-left">
                  <tr>
                    <th className="px-5 py-2 font-medium">Name</th>
                    <th className="px-5 py-2 font-medium">Email</th>
                    <th className="px-5 py-2 font-medium">Role</th>
                    <th className="px-5 py-2 font-medium">Grade</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u.full_name} size="sm" />
                          <span className="font-medium text-slate-800 dark:text-slate-200">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{u.email}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={ROLE_BADGE[u.role]}>{u.role}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">{u.grade_level ?? '—'}</td>
                      <td className="px-5 py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Active
                        </span>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewingUser(u)}
                            title="View"
                            className="p-1.5 rounded-md text-slate-300 dark:text-slate-600 hover:text-[#4338CA] dark:hover:text-[#C7D2FE] hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B] transition-colors"
                          >
                            <Eye className="size-4" />
                          </button>
                          <button
                            onClick={() => setEditingUser(u)}
                            title="Edit"
                            className="p-1.5 rounded-md text-slate-300 dark:text-slate-600 hover:text-[#4338CA] dark:hover:text-[#C7D2FE] hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B] transition-colors"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => setDeletingUser(u)}
                            title="Delete"
                            className="p-1.5 rounded-md text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="User distribution" description="Accounts by role">
            <DonutChart
              data={ROLES.map((r) => ({ label: ROLE_LABEL[r], value: counts[r], color: ROLE_COLORS[r] }))}
              centerLabel="Total"
            />
          </Card>
          <Card title="Accounts by role">
            <BarsChart
              data={ROLES.map((r) => ({ label: ROLE_LABEL[r], value: counts[r], color: ROLE_COLORS[r] }))}
              height={170}
            />
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Total accounts: {users.length}</p>
          </Card>
        </div>
        </div>
      ) : (
        <Card title="Parent ↔ child links" description={`${links.length} links`}>
          {links.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No links yet"
              description="Link a parent to a child account to enable monitoring."
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {links.map((l) => (
                <li key={l.id} className="py-3 flex items-center gap-3 text-sm group">
                  <Avatar name={nameOf(l.parent_id)} size="sm" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">{nameOf(l.parent_id)}</span>
                  <Link2 className="size-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                  <Avatar name={nameOf(l.child_id)} size="sm" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">{nameOf(l.child_id)}</span>
                  {l.relationship && <Badge>{l.relationship}</Badge>}
                  <button
                    onClick={() => setDeletingLink(l)}
                    title="Remove link"
                    className="ml-auto p-1.5 rounded-md text-slate-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          refresh()
          toast.success('Account created')
        }}
      />
      <LinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        parents={users.filter((u) => u.role === 'parent')}
        childProfiles={users.filter((u) => u.role === 'child')}
        onLinked={() => {
          refresh()
          toast.success('Parent and child linked')
        }}
      />
      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={() => {
          refresh()
          toast.success('Account updated')
        }}
      />
      <ViewUserModal user={viewingUser} onClose={() => setViewingUser(null)} />
      <ConfirmDialog
        open={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDeleteUser}
        loading={actionInProgress}
        title="Delete account"
        description={`This permanently deletes ${deletingUser?.full_name}'s account and all of their data (activity, links, materials, quizzes). This can't be undone.`}
      />
      <ConfirmDialog
        open={!!deletingLink}
        onClose={() => setDeletingLink(null)}
        onConfirm={handleDeleteLink}
        loading={actionInProgress}
        title="Remove link"
        description={`This removes ${deletingLink ? nameOf(deletingLink.parent_id) : ''}'s monitoring access to ${
          deletingLink ? nameOf(deletingLink.child_id) : ''
        }.`}
        confirmLabel="Remove"
      />
      </>
      )}
    </PortalLayout>
  )
}

function ViewUserModal({ user, onClose }: { user: Profile | null; onClose: () => void }) {
  return (
    <Modal open={!!user} onClose={onClose} title="Account details">
      {user && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.full_name} />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{user.full_name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Role</dt>
              <dd className="mt-0.5"><Badge tone={ROLE_BADGE[user.role]}>{user.role}</Badge></dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Grade level</dt>
              <dd className="mt-0.5 text-slate-700 dark:text-slate-300">{user.grade_level ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Status</dt>
              <dd className="mt-0.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400 dark:text-slate-500">Created</dt>
              <dd className="mt-0.5 text-slate-700 dark:text-slate-300">{new Date(user.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  )
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('child')
  const [gradeLevel, setGradeLevel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiPost('/admin/users', {
        email,
        password,
        full_name: fullName,
        role,
        grade_level: role === 'child' && gradeLevel ? gradeLevel : null,
      })
      setEmail('')
      setPassword('')
      setFullName('')
      setGradeLevel('')
      setRole('child')
      onClose()
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create account" description="Provision a login for a new user.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Temporary password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        {role === 'child' && (
          <Field label="Grade level (optional)">
            <Input placeholder="e.g. O/L, Grade 11" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
          </Field>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create account
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: Profile | null
  onClose: () => void
  onSaved: () => void
}) {
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<UserRole>('child')
  const [gradeLevel, setGradeLevel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      setFullName(user.full_name)
      setRole(user.role)
      setGradeLevel(user.grade_level ?? '')
      setError(null)
    }
  }, [user])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)
    try {
      await apiPatch(`/admin/users/${user.id}`, {
        full_name: fullName,
        role,
        grade_level: role === 'child' ? gradeLevel || null : null,
      })
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title="Edit account" description={user?.email ?? undefined}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        {role === 'child' && (
          <Field label="Grade level (optional)">
            <Input placeholder="e.g. O/L, Grade 11" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
          </Field>
        )}

        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RiskSection() {
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [meta, setMeta] = useState<PredictionRunResult['metrics'] | null>(null)
  const toast = useToast()
  const navigate = useNavigate()

  async function loadRoster() {
    setLoading(true)
    try {
      setRoster(await apiGet<RosterRow[]>('/admin/students/roster'))
    } catch {
      setRoster([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRoster()
  }, [])

  async function runBatch() {
    setRunning(true)
    try {
      const result = await apiPost<PredictionRunResult>('/predictions/run', {})
      setMeta(result.metrics)
      toast.success(`Predicted ${result.predicted} child account(s) · model ${result.model_version}`)
      await loadRoster()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run predictions')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Performance-risk roster"
        description={`${roster.length} child account(s) — highest risk first · Random Forest, explainable`}
        actions={
          <Button icon={<RefreshCw className={`size-4 ${running ? 'animate-spin' : ''}`} />} onClick={runBatch} loading={running}>
            Run predictions
          </Button>
        }
      >
        {roster.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="No child accounts" description="Create child accounts to generate predictions." />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead className="text-slate-500 dark:text-slate-400 text-left">
                <tr>
                  <th className="px-5 py-2 font-medium">Child</th>
                  <th className="px-5 py-2 font-medium">Risk band</th>
                  <th className="px-5 py-2 font-medium">Confidence</th>
                  <th className="px-5 py-2 font-medium">Last active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {roster.map((r) => (
                  <tr
                    key={r.child_id}
                    tabIndex={0}
                    role="button"
                    onClick={() => navigate(`/admin/students/${r.child_id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/admin/students/${r.child_id}`)
                      }
                    }}
                    className="hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 focus:outline-none focus:bg-[#f8fafc] dark:focus:bg-slate-800/60 focus:ring-2 focus:ring-inset focus:ring-[#8c7569] transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.full_name ?? '—'} size="sm" />
                        <div>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{r.full_name ?? '—'}</span>
                          {r.grade_level && <span className="ml-2 text-xs text-slate-400">{r.grade_level}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      {r.risk_band ? <Badge tone={RISK_META[r.risk_band].tone}>{RISK_META[r.risk_band].label}</Badge> : <span className="text-slate-400">{loading ? '…' : '—'}</span>}
                    </td>
                    <td className="px-5 py-2.5 text-slate-500 dark:text-slate-400">
                      {r.risk_score != null ? `${Math.round(r.risk_score * 100)}%` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-slate-400 dark:text-slate-500">
                      {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {meta && (
        <Card title="Model health" description="Held-out test metrics from the last training run">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(meta).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-400 dark:text-slate-500">{k.replace(/_/g, ' ')}</dt>
                <dd className="text-lg font-semibold text-slate-800 dark:text-slate-200">{typeof v === 'number' ? v.toFixed(3) : v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </div>
  )
}

function LinkModal({
  open,
  onClose,
  parents,
  childProfiles,
  onLinked,
}: {
  open: boolean
  onClose: () => void
  parents: Profile[]
  childProfiles: Profile[]
  onLinked: () => void
}) {
  const [parentId, setParentId] = useState('')
  const [childId, setChildId] = useState('')
  const [relationship, setRelationship] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiPost('/admin/links', { parent_id: parentId, child_id: childId, relationship: relationship || null })
      setParentId('')
      setChildId('')
      setRelationship('')
      onClose()
      onLinked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link parent and child')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Link parent to child" description="Grants the parent monitoring access to this child.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Parent">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)} required>
            <option value="" disabled>
              Select a parent
            </option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.email})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Child">
          <Select value={childId} onChange={(e) => setChildId(e.target.value)} required>
            <option value="" disabled>
              Select a child
            </option>
            {childProfiles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} ({c.email})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Relationship (optional)">
          <Input placeholder="e.g. mother, father, guardian" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
        </Field>

        {parents.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Create a parent account first.</p>}
        {childProfiles.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Create a child account first.</p>}
        {error && <Alert>{error}</Alert>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={parents.length === 0 || childProfiles.length === 0}>
            Link parent and child
          </Button>
        </div>
      </form>
    </Modal>
  )
}
