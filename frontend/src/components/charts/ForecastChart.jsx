import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatDate, formatForecast, horizonLabel } from '@/lib/format'

const chartConfig = {
  p50: { label: 'P50', color: 'var(--primary-teal)' },
  p90: { label: 'P90 (sum of stores)', color: 'var(--accent-mint)' },
}

/**
 * Weekly demand forecast per horizon (H1–H4): P50 and P90 as grouped bars.
 * Works for item totals ({horizon, target_week, p50, p90_sum}) and for one store's rows ({horizon, target_week, p50, p90}).
 *
 * @param {{ rows: { horizon: number, target_week: string, p50: number, p90?: number, p90_sum?: number }[], unit?: string, className?: string }} props
 */
export default function ForecastChart({ rows, unit, className }) {
  const data = useMemo(
    () =>
      [...(rows ?? [])]
        .sort((a, b) => a.horizon - b.horizon)
        .map((row) => ({
          horizon: horizonLabel(row.horizon),
          week: formatDate(row.target_week),
          p50: row.p50,
          p90: row.p90 ?? row.p90_sum ?? null,
        })),
    [rows],
  )

  return (
    <ChartContainer config={chartConfig} className={className ?? 'aspect-auto h-[240px] w-full'}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="30%" barGap={3}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="horizon" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={56} tickFormatter={(value) => formatForecast(value)} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
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
        <Bar dataKey="p50" fill="var(--color-p50)" radius={[4, 4, 0, 0]} maxBarSize={44} />
        <Bar dataKey="p90" fill="var(--color-p90)" radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ChartContainer>
  )
}
