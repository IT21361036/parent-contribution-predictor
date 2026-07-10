import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART } from './chartTheme'

export interface TrendPoint {
  label: string
  value: number
}

// Single-series time trend in the brand hue — 'area' for volumes (activity
// counts), 'line' for rates (score %). Identity comes from the card title, so
// there is no legend; values live in the hover tooltip.
export function TrendChart({
  data,
  mode = 'area',
  height = 220,
  valueFormatter = (v: number) => String(v),
  yDomain,
}: {
  data: TrendPoint[]
  mode?: 'area' | 'line'
  height?: number
  valueFormatter?: (v: number) => string
  yDomain?: [number, number]
}) {
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: -16 },
  }
  const axes = (
    <>
      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" minTickGap={24} />
      <YAxis tick={CHART.tick} tickLine={false} axisLine={false} width={52} allowDecimals={false} domain={yDomain} tickFormatter={valueFormatter} />
      <Tooltip
        contentStyle={CHART.tooltip}
        labelStyle={CHART.tooltipLabel}
        itemStyle={CHART.tooltipItem}
        formatter={(v: number | string) => [valueFormatter(Number(v)), null]}
        cursor={{ stroke: CHART.cursor, strokeWidth: 1 }}
      />
    </>
  )

  return (
    <ResponsiveContainer width="100%" height={height}>
      {mode === 'area' ? (
        <AreaChart {...common}>
          {axes}
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART.brand}
            strokeWidth={2}
            fill={CHART.brand}
            fillOpacity={0.12}
            activeDot={{ r: 4, fill: CHART.brand, stroke: CHART.dotRing, strokeWidth: 2 }}
          />
        </AreaChart>
      ) : (
        <LineChart {...common}>
          {axes}
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART.brand}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART.brand, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: CHART.brand, stroke: CHART.dotRing, strokeWidth: 2 }}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
