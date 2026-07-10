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

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 h-20 shrink-0 border-b border-[#e2e8f0] dark:border-slate-800 text-[#4665f2] dark:text-[#93a8ff]">
        <GraduationCap className="size-6" />
        <span className="font-bold text-sm leading-tight text-slate-900 dark:text-slate-100">O/L Learning Portal</span>
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
                className={`animate-nav-in w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  active
                    ? `${BRAND.activeNav} shadow-sm translate-x-0.5`
                    : 'text-[#64748b] dark:text-slate-400 hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 hover:text-[#3550d4] dark:hover:text-[#a5b6ff]'
                }`}
              >
                <Icon className="size-5" />
                {item.label}
              </button>
            )
          })}
        </nav>
      )}

      <div className="px-3 py-4 border-t border-[#e2e8f0] dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3 rounded-xl p-2 hover:bg-[#f8fafc] dark:hover:bg-slate-800/60 transition-colors group">
          <Avatar name={profile?.full_name ?? '?'} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#0f172a] dark:text-slate-100 truncate">{profile?.full_name}</p>
            {profile?.role && <Badge tone={ROLE_BADGE_TONE[profile.role]}>{profile.role}</Badge>}
          </div>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-[#94a3b8] hover:text-[#4665f2] dark:hover:text-[#93a8ff] hover:bg-[#eef2fe] dark:hover:bg-[#1c2a63] p-1.5 rounded-lg transition-colors shrink-0"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            className="text-[#94a3b8] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 p-1.5 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] text-[#94a3b8]">O/L LMS &middot; FYP Prototype</p>
      </div>
    </div>
  )

  return (
    <div className={`min-h-screen ${BRAND.surface}`}>
      <Dialog open={mobileOpen} onClose={setMobileOpen} className="relative z-50 lg:hidden">
        <div className="fixed inset-0 bg-[#0f172a]/50 transition-opacity" aria-hidden="true" />
        <div className="fixed inset-0 flex">
          <DialogPanel className="relative flex w-72 flex-col bg-white dark:bg-slate-900 shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-white/80 hover:text-white"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </DialogPanel>
        </div>
      </Dialog>

      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col lg:border-r lg:border-[#e2e8f0] dark:lg:border-slate-800 lg:bg-white dark:lg:bg-slate-900">
        {sidebar}
      </div>

      <div className="lg:pl-72">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-[#e2e8f0] dark:border-slate-800 px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-[#4665f2] dark:text-[#93a8ff] hover:text-[#3550d4] dark:hover:text-[#a5b6ff] p-1.5 -ml-1.5 rounded-md hover:bg-[#f8fafc] dark:hover:bg-slate-800/60"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{title}</span>
        </header>

        <main className="animate-page-in p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto">
          <div className="hidden lg:flex items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
              {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
            </div>
            {headerActions}
          </div>
          <div className="lg:hidden flex items-center justify-end mb-4">{headerActions}</div>

          {children}
        </main>
      </div>
    </div>
  )
}
