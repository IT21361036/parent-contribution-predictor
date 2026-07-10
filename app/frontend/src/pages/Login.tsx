import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Moon, Sun } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const BACKGROUND_IMAGE =
  'https://images.unsplash.com/photo-1538137524007-21e48fa42f3f?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjEyMDd9&s=ac9fa0975bd2ebad7afd906c5a3a15ab&auto=format&fit=crop&w=1834&q=80'
const PANEL_IMAGE =
  'https://images.unsplash.com/photo-1512486130939-2c4f79935e4f?ixlib=rb-0.3.5&ixid=eyJhcHBfaWQiOjEyMDd9&s=dfd2ec5a01006fd8c4d7592a381d3776&auto=format&fit=crop&w=1000&q=80'

const fieldClass =
  'flex flex-col gap-1 rounded-lg border border-[#e2e8f0] dark:border-slate-800 px-3 py-2 transition-colors focus-within:border-[#4665f2]'
const labelClass = 'text-[10px] font-bold uppercase tracking-wide text-[#4665f2] dark:text-[#93a8ff]'
const inputClass = 'border-0 p-0 text-sm text-[#0f172a] dark:text-slate-100 outline-none placeholder:text-[#94a3b8]'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { signInWithPassword } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const result = await signInWithPassword(email, password)

    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate('/')
  }

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center bg-cover bg-center p-4"
      style={{ backgroundImage: `url(${BACKGROUND_IMAGE})` }}
    >
      <div className="absolute inset-0 bg-black/30 dark:bg-black/55" />

      <button
        onClick={toggle}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 z-20 rounded-full bg-white/20 p-2 text-white backdrop-blur transition-colors hover:bg-white/35"
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>

      <div className="relative z-10 w-full max-w-3xl flex flex-col md:flex-row rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-slate-900 animate-login-card-in">
        <div className="flex-[1.5] px-8 py-10 sm:px-12 sm:py-12">
          <div className="flex items-center gap-2 mb-8 text-[#4665f2] dark:text-[#93a8ff]">
            <GraduationCap className="size-6" />
            <span className="text-xs font-bold uppercase tracking-wider">O/L Learning Portal</span>
          </div>

          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-2">Welcome back</h1>
          <p className="text-sm text-[#4665f2]/80 dark:text-[#93a8ff]/80 mb-8">
            Sign in with the account your school administrator created for you.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={fieldClass}>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                className={inputClass}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className={fieldClass}>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                className={inputClass}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                minLength={6}
                required
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#4665f2] px-8 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#4665f2]/30 transition-colors hover:bg-[#3550d4] disabled:opacity-60"
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-[#4665f2]/70 dark:text-[#93a8ff]/70">
            O/L LMS with Parental Monitoring &middot; Final Year Project
          </p>
        </div>

        <div className="hidden md:block flex-[2] relative overflow-hidden">
          <img src={PANEL_IMAGE} alt="" className="h-full w-full object-cover animate-login-panel-in" />
        </div>
      </div>
    </div>
  )
}
