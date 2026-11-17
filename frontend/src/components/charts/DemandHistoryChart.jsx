import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { formatDate, formatForecast, formatNumber, parseDate } from '@/lib/format'

const chartConfig = {
  actual: { label: 'Actual demand', color: 'var(--primary-teal)' },
  p50: { label: 'Forecast', color: 'var(--primary-teal)' },
  p90: { label: 'High estimate (P90)', color: 'var(--accent-mint)' },
}

/** "8 Dec" style tick for a YYYY-MM-DD week start. */
function shortWeek(value) {
  const date = parseDate(value)
  if (!date) return ''
  return `${date.getDate()} ${formatDate(value).split(' ')[1]}`
}

function ChartTooltip({ active, payload, unit, showRange }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const suffix = unit ? ` ${unit}` : ''
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">Week of {formatDate(row.week)}</p>
      {row.actual != null ? (
        <p className="mt-1 text-muted-foreground">
          Actual <span className="font-mono font-medium text-foreground">{formatNumber(Math.round(row.actual))}{suffix}</span>
        </p>
      ) : (
        <>
          <p className="mt-1 text-muted-foreground">
            Forecast <span className="font-mono font-medium text-foreground">{formatForecast(row.p50)}{suffix}</span>
          </p>
          {showRange && row.p90 != null ? (
            <p className="text-muted-foreground">
              High estimate (P90) <span className="font-mono font-medium text-foreground">{formatForecast(row.p90)}{suffix}</span>
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

function Legend({ showRange }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-0.5 w-5 rounded bg-primary" />
        Actual demand
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-0 w-5 border-t-2 border-dashed border-primary" />
        Forecast (next 4 weeks)
      </span>
      {showRange ? (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-5 rounded bg-mint/50" />
          Range up to the high estimate (P90)
        </span>
      ) : null}
    </div>
  )
}

/**
 * One line of weekly demand for an item (or an item at one store): solid for the recorded past, dashed for the next
 * four forecast weeks (P50). The P50-P90 range is drawn only when `showRange` is on (plan: P90 is kept for planning,
 * not as a headline). The forecast line starts from the last actual week so the two join.
 *
 * @param {{ history: { week_start: string, demand_qty: number }[], forecast: { target_week: string, p50: number, p90?: number }[],
 *   unit?: string, showRange?: boolean, className?: string }} props
 */
export default function DemandHistoryChart({ history, forecast, unit, showRange = false, className }) {
  const data = useMemo(() => {
    const past = [...(history ?? [])].sort((a, b) => a.week_start.localeCompare(b.week_start)).map((row) => ({ week: row.week_start, actual: row.demand_qty }))
    const future = [...(forecast ?? [])]
      .sort((a, b) => a.target_week.localeCompare(b.target_week))
      .map((row) => ({ week: row.target_week, p50: row.p50, p90: row.p90 ?? null, band: row.p90 != null ? [row.p50, row.p90] : null }))
    if (past.length && future.length) {
      const last = past[past.length - 1]
      // join point: the dashed forecast line starts where the solid line ends
      last.p50 = last.actual
      last.band = [last.actual, last.actual]
    }
    return [...past, ...future]
  }, [history, forecast])

  const firstForecastWeek = useMemo(() => [...(forecast ?? [])].map((r) => r.target_week).sort()[0] ?? null, [forecast])

  return (
    <div>
      <ChartContainer config={chartConfig} className={className ?? 'aspect-auto h-[260px] w-full'}>
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} tickFormatter={shortWeek} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={56} tickFormatter={(value) => formatNumber(value)} />
          <Tooltip cursor={{ stroke: 'var(--border)' }} content={<ChartTooltip unit={unit} showRange={showRange} />} />
          {firstForecastWeek ? (
            <ReferenceLine x={firstForecastWeek} stroke="var(--border)" strokeDasharray="4 3" label={{ value: 'forecast', position: 'insideTopRight', fontSize: 10, fill: 'var(--text-muted)' }} />
          ) : null}
          {showRange ? <Area dataKey="band" type="monotone" stroke="none" fill="var(--color-p90)" fillOpacity={0.35} isAnimationActive={false} connectNulls={false} /> : null}
          <Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="p50" type="monotone" stroke="var(--color-p50)" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-p50)' }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ChartContainer>
      <Legend showRange={showRange} />
    </div>
  )
}
