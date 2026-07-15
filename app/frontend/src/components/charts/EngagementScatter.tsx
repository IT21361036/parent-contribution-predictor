import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { EngagementPerformancePoint } from '../../lib/types'

// Risk-band dot colours — semantic (green/amber/red), readable against the grid.
const BAND_COLOR: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
}
const NEUTRAL = '#94A3B8'

function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: EngagementPerformancePoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-[var(--chart-tooltip-item)]">{p.name ?? 'Student'}</p>
      <p className="text-[var(--chart-tooltip-label)]">Engagement: {p.engagement}</p>
      <p className="text-[var(--chart-tooltip-label)]">Performance: {p.performance}%</p>
      {p.risk_band && <p className="text-[var(--chart-tooltip-label)] capitalize">Risk: {p.risk_band}</p>}
    </div>
  )
}

export function EngagementScatter({ points, height = 340 }: { points: EngagementPerformancePoint[]; height?: number }) {
  // Least-squares trend line across the cohort.
  const xs = points.map((p) => p.engagement)
  const ys = points.map((p) => p.performance)
  const n = xs.length
  let trend: { x: number; y: number }[] | null = null
  if (n >= 2) {
    const mx = xs.reduce((a, b) => a + b, 0) / n
    const my = ys.reduce((a, b) => a + b, 0) / n
    const denom = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
    if (denom > 0) {
      const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / denom
      const intercept = my - slope * mx
      const xmin = Math.min(...xs)
      const xmax = Math.max(...xs)
      trend = [
        { x: xmin, y: slope * xmin + intercept },
        { x: xmax, y: slope * xmax + intercept },
      ]
    }
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 4 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="engagement"
          name="Engagement"
          domain={[0, 100]}
          tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
          stroke="var(--chart-grid)"
          label={{ value: 'Parental engagement index', position: 'bottom', offset: 8, fill: 'var(--chart-tick)', fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="performance"
          name="Performance"
          domain={[0, 100]}
          tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
          stroke="var(--chart-grid)"
          label={{ value: 'Performance (%)', angle: -90, position: 'insideLeft', fill: 'var(--chart-tick)', fontSize: 12 }}
        />
        <ZAxis range={[90, 90]} />
        <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--chart-cursor)' }} />
        {trend && (
          <ReferenceLine
            segment={trend}
            stroke="#7C3AED"
            strokeWidth={2}
            strokeDasharray="6 4"
            ifOverflow="extendDomain"
          />
        )}
        <Scatter data={points} fillOpacity={0.85}>
          {points.map((p) => (
            <Cell key={p.child_id} fill={p.risk_band ? BAND_COLOR[p.risk_band] ?? NEUTRAL : NEUTRAL} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}
