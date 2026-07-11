import { useState, type ReactNode } from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { GraduationCap, LogOut, Menu, Moon, Sun, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { BRAND, ROLE_BADGE_TONE } from '../lib/theme'
import { Avatar } from './ui/Avatar'
import { Badge } from './ui/Badge'

export interface NavItem {
  key: string
  label: string
  icon: LucideIcon
  badge?: number
}

export function PortalLayout({
  title,
  subtitle,
  navItems,
  activeKey,
  onNavigate,
  headerActions,
  children,
}: {
  title: string
  subtitle?: string
  navItems?: NavItem[]
  activeKey?: string
  onNavigate?: (key: string) => void
  headerActions?: ReactNode
  children: ReactNode
}) {
  const { profile, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)

  function navigate(key: string) {
    onNavigate?.(key)
    setMobileOpen(false)
  }

  // The rail is study-ink in both themes — a calm, focused frame that lets the
  // lamp-gold active state be the one warm point of light in the chrome.
  const sidebar = (
    <div className="flex h-full flex-col bg-[#1E1B3A] text-slate-300">
      <div className="flex items-center gap-2.5 px-6 h-20 shrink-0 border-b border-white/10">
        <span className="grid size-9 place-items-center rounded-xl bg-[#9333EA]/15 text-[#9333EA]">
          <GraduationCap className="size-5" />
        </span>
        <span className="font-display font-bold text-[15px] leading-tight text-white">O/L Learning Portal</span>
      </div>

      {navItems && navItems.length > 0 && (
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item, i) => {
            const Icon = item.icon
            const active = item.key === activeKey
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{ animationDelay: `${i * 40}ms` }}
                className={`animate-nav-in relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? 'bg-[#9333EA]/12 text-[#C4B5FD]'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[#9333EA]" />
                )}
                <Icon className={`size-5 ${active ? 'text-[#9333EA]' : ''}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? (
                  <span className="animate-badge-pulse shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-[#C9553B] text-white text-[11px] font-semibold flex items-center justify-center">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
      )}

      <div className="px-3 py-4 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/5 transition-colors">
          <Avatar name={profile?.full_name ?? '?'} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white truncate">{profile?.full_name}</p>
            {profile?.role && <Badge tone={ROLE_BADGE_TONE[profile.role]}>{profile.role}</Badge>}
          </div>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-slate-400 hover:text-[#9333EA] hover:bg-white/10 p-1.5 rounded-lg transition-colors shrink-0"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            className="text-slate-400 hover:text-[#E08E75] hover:bg-white/10 p-1.5 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-center eyebrow text-slate-500">O/L LMS · FYP</p>
      </div>
    </div>
  )

  const roleEyebrow = profile?.role ? `${profile.role} · portal` : 'portal'

  return (
    <div className={`min-h-screen ${BRAND.surface}`}>
      <Dialog open={mobileOpen} onClose={setMobileOpen} className="relative z-50 lg:hidden">
        <div className="fixed inset-0 bg-[#0f172a]/60 transition-opacity" aria-hidden="true" />
        <div className="fixed inset-0 flex">
          <DialogPanel className="relative flex w-72 flex-col shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-5 right-4 z-10 text-white/70 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </DialogPanel>
        </div>
      </Dialog>

      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col">{sidebar}</div>

      <div className="lg:pl-72">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-[#1E1B3A] text-white px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[#9333EA] hover:bg-white/10 p-1.5 -ml-1.5 rounded-md"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <span className="font-display text-sm font-bold truncate">{title}</span>
        </header>

        <main className="animate-page-in p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <p className="eyebrow text-[#4F46E5] dark:text-[#A5B4FC] mb-1.5">{roleEyebrow}</p>
              <h1 className="font-display text-2xl sm:text-[28px] font-extrabold text-[#1E1B3A] dark:text-slate-100 leading-tight">
                {title}
              </h1>
              {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">{subtitle}</p>}
            </div>
            {headerActions}
          </div>

          {children}
        </main>
      </div>
    </div>
  )
}
