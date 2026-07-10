import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CHART } from './chartTheme'

export interface DonutSlice {
  label: string
  value: number
  color: string
}

// Animated donut with a center total and a color-swatch legend beneath —
// hovering a slice fades the others and highlights its legend row, in the
// spirit of the user's animated-pie reference. Colors come from the caller
// (usually the validated ROLE_COLORS palette).
export function DonutChart({
  data,
  height = 200,
  centerLabel = 'Total',
}: {
  data: DonutSlice[]
  height?: number
  centerLabel?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const shown = data.filter((d) => d.value > 0)

  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              contentStyle={CHART.tooltip}
              labelStyle={CHART.tooltipLabel}
              itemStyle={CHART.tooltipItem}
              formatter={(v: number | string, name: string) => [
                `${v} (${total ? Math.round((Number(v) / total) * 100) : 0}%)`,
                name,
              ]}
            />
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              strokeWidth={0}
              onMouseEnter={(_, i) => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {shown.map((d, i) => (
                <Cell
                  key={d.label}
                  fill={d.color}
                  opacity={hovered === null || hovered === i ? 1 : 0.35}
                  style={{ transition: 'opacity 0.2s ease' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold text-slate-800 dark:text-slate-200 leading-none">{total}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 mt-1">{centerLabel}</span>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {data.map((d) => {
          const i = shown.findIndex((s) => s.label === d.label)
          const dim = hovered !== null && i !== hovered
          return (
            <li
              key={d.label}
              className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 transition-opacity"
              style={{ opacity: dim ? 0.4 : 1 }}
            >
              <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="truncate">
                {d.label} ({d.value})
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
