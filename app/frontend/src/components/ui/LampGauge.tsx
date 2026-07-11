// Signature element of the "Lamplight" identity: the Parental Engagement Index
// as a lamp. A gold arc fills with the score and a soft glow behind the dial
// brightens as engagement rises — a literal read on how brightly the parent is
// lighting the child's path. Pure SVG + CSS, theme-aware, reduced-motion safe.
export function LampGauge({ value, size = 168 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(1, value))
  const display = Math.round(pct * 100)
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // Leave a gap at the bottom (270° dial) so it reads as a gauge, not a ring.
  const sweep = 0.75
  const dash = c * sweep
  const offset = dash * (1 - pct)

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      {/* Glow — opacity tracks the score. */}
      <div
        className="absolute rounded-full animate-lamp-glow"
        style={{
          width: size * 0.72,
          height: size * 0.72,
          background: 'radial-gradient(circle, rgba(147,51,234,0.85) 0%, rgba(79,70,229,0) 70%)',
          opacity: 0.2 + pct * 0.6,
        }}
        aria-hidden="true"
      />
      <svg width={size} height={size} className="relative -rotate-[135deg]" role="img" aria-label={`Engagement ${display} of 100`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-[#E5E7F0] dark:stroke-[#2E2A52]"
          strokeDasharray={`${dash} ${c}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="url(#lampGrad)"
          strokeDasharray={`${dash} ${c}`}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)' }}
        />
        <defs>
          <linearGradient id="lampGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4F46E5" />
            <stop offset="55%" stopColor="#9333EA" />
            <stop offset="100%" stopColor="#C4B5FD" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-4xl font-extrabold text-[#1E1B3A] dark:text-slate-100 leading-none">
          {display}
        </span>
        <span className="eyebrow mt-1 text-slate-400">/ 100 index</span>
      </div>
    </div>
  )
}
