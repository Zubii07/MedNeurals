import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatDate, formatForecast, horizonLabel } from '@/lib/format'

const chartConfig = {
  p50: { label: 'P50', color: 'var(--primary-teal)' },
  p90: { label: 'P90', color: 'var(--accent-mint)' },
}

/**
 * One store's weekly forecast (plan §7.5): P50 line with a shaded P50–P90 band, `target_week` on the x-axis.
 * @param {{ rows: import('@/api/shapes').ForecastRow[], unit?: string, className?: string }} props
 */
export default function ForecastBandChart({ rows, unit, className }) {
  const data = useMemo(
    () =>
      [...(rows ?? [])]
        .sort((a, b) => a.horizon - b.horizon)
        .map((row) => ({
          horizon: horizonLabel(row.horizon),
          week: formatDate(row.target_week),
          p50: row.p50,
          p90: row.p90,
          band: [row.p50, row.p90],
        })),
    [rows],
  )

  return (
    <ChartContainer config={chartConfig} className={className ?? 'aspect-auto h-[260px] w-full'}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} padding={{ left: 24, right: 24 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={56} tickFormatter={(value) => formatForecast(value)} />
        <ChartTooltip
          cursor={{ stroke: 'var(--border)' }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload
                return item ? `${item.horizon} · week of ${item.week}` : ''
              }}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{chartConfig[name]?.label ?? name}</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatForecast(value)}
                    {unit ? ` ${unit}` : ''}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="band" type="monotone" stroke="none" fill="var(--color-p90)" fillOpacity={0.35} tooltipType="none" legendType="none" isAnimationActive={false} />
        <Line dataKey="p90" type="monotone" stroke="var(--color-p90)" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-p90)' }} activeDot={{ r: 4 }} isAnimationActive={false} />
        <Line dataKey="p50" type="monotone" stroke="var(--color-p50)" strokeWidth={2.5} dot={{ r: 4, strokeWidth: 0, fill: 'var(--color-p50)' }} activeDot={{ r: 5 }} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  )
}
