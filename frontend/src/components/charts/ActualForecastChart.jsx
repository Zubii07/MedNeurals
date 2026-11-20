import { useMemo } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { mergeSeries } from '@/lib/forecast-series'
import { EM_DASH, formatDate, formatNumber, parseDate } from '@/lib/format'
import { unitWord } from '@/lib/trend'
import { cn } from '@/lib/utils'

/*
 * "Actual demand and forecast": one line chart for one product at one store (or any single series).
 *   - actual demand: solid 2px blue line; a week with `demand_qty: null` leaves a gap (nothing is invented)
 *   - expected demand (P50): dashed 2px orange line, starting from the last actual point so the lines join
 *   - a thin vertical marker where the forecast begins, labelled "Today" or "Forecast starts" by the caller
 * The P90 high estimate stays in the backend (safety stock); it is not drawn here.
 * Colours come from the theme tokens (--info, --warning) so light and dark both work; text stays neutral.
 */

const COLORS = { actual: 'var(--info)', expected: 'var(--warning)' }
const chartConfig = {
  actual: { label: 'Actual', color: COLORS.actual },
  p50: { label: 'Expected', color: COLORS.expected },
}

/** "23 Nov" for a YYYY-MM-DD week start. */
function shortWeek(value) {
  const date = parseDate(value)
  return date ? `${date.getDate()} ${formatDate(value).split(' ')[1]}` : ''
}

/** Whole units for display; the data keeps its decimals. */
function whole(value) {
  return value == null ? EM_DASH : formatNumber(Math.round(value))
}

function ChartTooltip({ active, payload, unitLabel }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-foreground shadow-md">
      <p className="font-medium">Week of {formatDate(row.week)}</p>
      {row.kind === 'actual' ? (
        <p className="mt-1">{row.actual == null ? 'No record for this week' : `Actual: ${whole(row.actual)} ${unitLabel}`}</p>
      ) : (
        <p className="mt-1">Expected: about {whole(row.p50)} {unitLabel}</p>
      )}
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-block h-0.5 w-6 rounded" style={{ backgroundColor: COLORS.actual }} />
        Actual
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="inline-block h-0 w-6 border-t-2 border-dashed" style={{ borderColor: COLORS.expected }} />
        Expected
      </li>
    </ul>
  )
}

/**
 * The chart. `markerLabel` is "Today" when the forecast period is current, else "Forecast starts".
 * @param {{ history: { week_start: string, demand_qty: number | null }[], forecast: { target_week: string, p50: number }[],
 *   unit?: string, markerLabel?: string, className?: string }} props
 */
export default function ActualForecastChart({ history, forecast, unit, markerLabel = 'Forecast starts', className }) {
  const data = useMemo(() => mergeSeries(history, forecast), [history, forecast])
  const firstForecastWeek = useMemo(() => data.find((row) => row.kind === 'forecast')?.week ?? null, [data])
  const unitLabel = unitWord(unit)

  return (
    <div className="space-y-3">
      <Legend />
      <ChartContainer config={chartConfig} className={cn('aspect-auto h-[300px] w-full', className)}>
        <ComposedChart data={data} margin={{ top: 20, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={10} tick={{ fontSize: 11 }} tickFormatter={shortWeek} interval="preserveStartEnd" minTickGap={28} />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={64}
            domain={[0, 'auto']}
            allowDecimals={false}
            tickFormatter={(value) => formatNumber(value)}
            label={{ value: `${unitLabel.charAt(0).toUpperCase()}${unitLabel.slice(1)} per week`, angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11, fill: 'var(--text-muted)', textAnchor: 'middle' } }}
          />
          <Tooltip cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} content={<ChartTooltip unitLabel={unitLabel} />} isAnimationActive={false} />
          {firstForecastWeek ? (
            <ReferenceLine
              x={firstForecastWeek}
              stroke="var(--text-muted)"
              strokeWidth={1}
              label={{ value: markerLabel, position: 'top', fontSize: 11, fill: 'var(--text-muted)' }}
            />
          ) : null}
          <Line dataKey="actual" type="monotone" stroke={COLORS.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
          <Line dataKey="p50" type="monotone" stroke={COLORS.expected} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, strokeWidth: 0, fill: COLORS.expected }} activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
