import { useState, type FormEvent, type MouseEvent } from 'react'
import {
  Atom,
  BookOpen,
  Calculator,
  Eye,
  EyeOff,
  FlaskConical,
  Globe,
  GraduationCap,
  Lightbulb,
  PenTool,
  Ruler,
  ShieldCheck,
  Sigma,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Aurora Glass: a vibrant mesh-gradient canvas with a frosted sign-in card.
// The login is intentionally always dark+vibrant (independent of app theme) so
// the first impression is consistent and high-impact.
const fieldClass =
  'flex flex-col gap-1 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 backdrop-blur-sm transition-colors focus-within:border-white/40 focus-within:bg-white/10 focus-within:ring-2 focus-within:ring-[#22D3EE]/40'
const labelClass = 'eyebrow text-white/75'
const inputClass =
  'w-full border-0 bg-transparent p-0 text-sm text-white outline-none placeholder:text-white/55'

// Deterministic mote field (no Math.random → stable across renders, no flicker).
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  left: (i * 6.3 + 4) % 100,
  size: 2 + (i % 4),
  duration: 9 + (i % 6) * 1.4,
  delay: (i % 8) * 1.3,
}))

// On-theme floating study glyphs scattered behind the aurora. Positions are
// fixed (deterministic) and kept low-opacity so the form stays readable.
const GLYPHS = [
  { Icon: BookOpen, left: 7, top: 20, size: 42, rot: -12, dur: 7, delay: 0, color: 'text-[#818CF8]' },
  { Icon: GraduationCap, left: 19, top: 72, size: 54, rot: 8, dur: 9, delay: 1.2, color: 'text-[#C4B5FD]' },
  { Icon: Calculator, left: 60, top: 14, size: 36, rot: -6, dur: 8, delay: 0.6, color: 'text-[#F472B6]' },
  { Icon: Atom, left: 82, top: 62, size: 48, rot: 14, dur: 10, delay: 2, color: 'text-[#22D3EE]' },
  { Icon: Lightbulb, left: 45, top: 84, size: 34, rot: -10, dur: 7.5, delay: 1.6, color: 'text-[#C4B5FD]' },
  { Icon: PenTool, left: 90, top: 24, size: 30, rot: 10, dur: 8.5, delay: 0.3, color: 'text-[#818CF8]' },
  { Icon: FlaskConical, left: 33, top: 32, size: 32, rot: -8, dur: 9.5, delay: 2.4, color: 'text-[#F472B6]' },
  { Icon: Globe, left: 71, top: 86, size: 40, rot: 6, dur: 8, delay: 1, color: 'text-[#818CF8]' },
  { Icon: Sigma, left: 12, top: 46, size: 34, rot: 12, dur: 10, delay: 0.9, color: 'text-[#C4B5FD]' },
  { Icon: Ruler, left: 53, top: 55, size: 30, rot: -14, dur: 7, delay: 1.8, color: 'text-[#22D3EE]' },
]

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Track every step',
    desc: 'Materials, quizzes and sessions in one clear view.',
    tint: 'from-[#4F46E5] to-[#9333EA]',
  },
  {
    icon: ShieldCheck,
    title: 'Private attention check',
    desc: 'The camera runs on your device — never uploaded.',
    tint: 'from-[#9333EA] to-[#F472B6]',
  },
  {
    icon: Sparkles,
    title: 'Explainable insights',
    desc: 'See why the model flags O/L risk, in plain terms.',
    tint: 'from-[#22D3EE] to-[#4F46E5]',
  },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { signInWithPassword } = useAuth()
  const navigate = useNavigate()

  // Subtle pointer parallax on the background glyph layer (disabled for
  // reduced-motion users, since it's motion the CSS guard can't reach).
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [par, setPar] = useState({ x: 0, y: 0 })
  function handlePointer(e: MouseEvent) {
    if (reduceMotion) return
    setPar({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 })
  }

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
      onMouseMove={handlePointer}
      className="relative min-h-screen w-full overflow-hidden bg-[#0A0A1F] p-4 flex items-center justify-center"
    >
      {/* Aurora mesh — blurred colour fields slowly drifting behind the glass. */}
      <div
        className="pointer-events-none absolute -top-40 -left-32 size-[46rem] rounded-full blur-3xl animate-aurora"
        style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.55) 0%, transparent 70%)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/4 left-1/3 size-[40rem] rounded-full blur-3xl animate-aurora"
        style={{ background: 'radial-gradient(circle, rgba(147,51,234,0.45) 0%, transparent 70%)', animationDelay: '2.5s' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-24 size-[44rem] rounded-full blur-3xl animate-aurora"
        style={{ background: 'radial-gradient(circle, rgba(244,114,182,0.40) 0%, transparent 70%)', animationDelay: '5s' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-10 right-1/4 size-[30rem] rounded-full blur-3xl animate-aurora"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.30) 0%, transparent 70%)', animationDelay: '7.5s' }}
        aria-hidden="true"
      />

      {/* Floating study glyphs — on-theme learning motifs behind the aurora,
          with a subtle pointer parallax for depth. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden transition-transform duration-500 ease-out"
        style={{ transform: `translate3d(${-par.x * 26}px, ${-par.y * 26}px, 0)` }}
        aria-hidden="true"
      >
        {GLYPHS.map((g, i) => (
          <span
            key={i}
            className="absolute"
            style={{ left: `${g.left}%`, top: `${g.top}%`, transform: `rotate(${g.rot}deg)` }}
          >
            <g.Icon
              className={`animate-float-glyph ${g.color}`}
              style={{
                width: g.size,
                height: g.size,
                opacity: 0.3,
                filter: 'drop-shadow(0 0 10px currentColor)',
                animationDuration: `${g.dur}s`,
                animationDelay: `${g.delay}s`,
              }}
            />
          </span>
        ))}
      </div>

      {/* Ambient light motes drifting upward. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {PARTICLES.map((p, i) => (
          <span
            key={i}
            className="animate-drift-up absolute bottom-0 rounded-full bg-white/60 blur-[1px]"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Hero — children rise in on a stagger. */}
        <div className="hidden lg:block text-white">
          <div
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 backdrop-blur animate-rise-in"
            style={{ animationDelay: '0.05s' }}
          >
            <GraduationCap className="size-4 text-[#C4B5FD]" />
            <span className="eyebrow text-white/80">O/L Learning Portal</span>
          </div>
          <h1
            className="font-display text-[3.5rem] font-extrabold leading-[1.02] tracking-tight animate-rise-in"
            style={{ animationDelay: '0.15s' }}
          >
            Guide the light
            <br />
            your child{' '}
            <span className="animate-gradient-text bg-gradient-to-r from-[#818CF8] via-[#C084FC] to-[#F472B6] bg-clip-text text-transparent">
              studies by.
            </span>
          </h1>
          <p
            className="mt-6 max-w-md text-[15px] leading-relaxed text-white/70 animate-rise-in"
            style={{ animationDelay: '0.3s' }}
          >
            A learning portal built around the one thing the research points to: a parent
            who stays attentive. Track involvement, understand the signals, and help your
            child through O/L — together.
          </p>

          {/* What the portal actually does — three honest value pillars. */}
          <ul className="mt-9 space-y-3.5">
            {FEATURES.map((f, i) => (
              <li
                key={f.title}
                className="flex items-start gap-3 animate-rise-in"
                style={{ animationDelay: `${0.45 + i * 0.1}s` }}
              >
                <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${f.tint} text-white`}>
                  <f.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{f.title}</p>
                  <p className="text-xs text-white/60">{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Frosted sign-in card. */}
        <div className="rounded-3xl border border-white/15 bg-white/10 p-7 sm:p-9 shadow-2xl backdrop-blur-2xl animate-login-card-in">
          <div className="mb-7 lg:hidden inline-flex items-center gap-2.5 text-white">
            <GraduationCap className="size-6 text-[#C4B5FD]" />
            <span className="eyebrow text-white/80">O/L Learning Portal</span>
          </div>

          <h2 className="font-display text-2xl font-extrabold text-white animate-rise-in" style={{ animationDelay: '0.15s' }}>
            Welcome back
          </h2>
          <p className="mt-1.5 text-sm text-white/70 animate-rise-in" style={{ animationDelay: '0.22s' }}>
            Sign in with the account your school gave you.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div className={`${fieldClass} animate-rise-in`} style={{ animationDelay: '0.3s' }}>
              <label htmlFor="email" className={labelClass}>Email</label>
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
            <div className={`${fieldClass} animate-rise-in`} style={{ animationDelay: '0.38s' }}>
              <label htmlFor="password" className={labelClass}>Password</label>
              <div className="flex items-center gap-2">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className={inputClass}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  aria-pressed={showPw}
                  className="shrink-0 rounded-md p-0.5 text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE]"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-[#F472B6]/30 bg-[#F472B6]/10 px-3 py-2 text-sm text-[#FBCFE8]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#9333EA] bg-[length:200%_auto] animate-gradient-text px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/40 transition-all hover:-translate-y-px hover:shadow-[0_0_28px_rgba(124,58,237,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A1F] active:scale-[0.98] disabled:opacity-60 motion-reduce:transform-none animate-rise-in"
              style={{ animationDelay: '0.46s' }}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center eyebrow text-white/55">Parental Monitoring · Final Year Project</p>
        </div>
      </div>
    </div>
  )
}

