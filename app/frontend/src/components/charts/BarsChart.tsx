import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART } from './chartTheme'

export interface BarPoint {
  label: string
  value: number
  // Per-bar color (e.g. the validated role palette); falls back to the brand hue.
  color?: string
}

// Single-series category bars — rounded data-ends, baseline anchored, hover
// tooltip. Used for per-quiz averages, accounts by role, and the like.
export function BarsChart({
  data,
  height = 220,
  valueFormatter = (v: number) => String(v),
  yDomain,
}: {
  data: BarPoint[]
  height?: number
  valueFormatter?: (v: number) => string
  yDomain?: [number, number]
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="28%">
        <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval={0} minTickGap={8} />
        <YAxis tick={CHART.tick} tickLine={false} axisLine={false} width={52} allowDecimals={false} domain={yDomain} tickFormatter={valueFormatter} />
        <Tooltip
          contentStyle={CHART.tooltip}
          labelStyle={CHART.tooltipLabel}
          itemStyle={CHART.tooltipItem}
          formatter={(v: number | string) => [valueFormatter(Number(v)), null]}
          cursor={{ fill: CHART.cursorFill, opacity: 0.5 }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color ?? CHART.brand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
