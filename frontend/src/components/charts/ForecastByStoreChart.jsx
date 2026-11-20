import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { storeName, storeShortName } from '@/lib/enums'
import { formatDate, formatNumber } from '@/lib/format'
import { unitWord } from '@/lib/trend'

/*
 * Expected demand per sub-store: stores across the bottom, one bar per store showing the average expected demand
 * per week over the four forecast weeks (P50), so the officer sees at a glance where a product is used most. The
 * tooltip lists the four weeks. Display only: the rows are the saved forecast rows.
 */

const COLOR = 'var(--info)'

function ChartTooltip({ active, payload, unitLabel }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-foreground shadow-md">
      <p className="font-medium">{storeName(row.store)}</p>
      <p className="mt-1">About {formatNumber(Math.round(row.average))} {unitLabel} per week</p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {row.weeks.map((week) => (
          <li key={week.target_week}>
            Week of {formatDate(week.target_week)}: about {formatNumber(Math.round(week.p50))}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * @param {{ rows: import('@/api/shapes').ForecastRow[], unit?: string, className?: string }} props
 */
export default function ForecastByStoreChart({ rows, unit, className }) {
  const data = useMemo(() => {
    const byStore = new Map()
    for (const row of rows ?? []) {
      const entry = byStore.get(row.store_id) ?? { store: row.store_id, weeks: [] }
      entry.weeks.push({ target_week: row.target_week, p50: row.p50 })
      byStore.set(row.store_id, entry)
    }
    return [...byStore.values()]
      .map((entry) => ({ ...entry, weeks: entry.weeks.sort((a, b) => a.target_week.localeCompare(b.target_week)), average: entry.weeks.reduce((sum, w) => sum + w.p50, 0) / entry.weeks.length }))
      .sort((a, b) => b.average - a.average)
  }, [rows])
  const unitLabel = unitWord(unit)

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Average expected demand per week over the next four weeks, highest first. Hover a bar for each week.</p>
      <ChartContainer config={{ average: { label: 'Expected per week', color: COLOR } }} className={className ?? 'aspect-auto h-[280px] w-full'}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
          <XAxis dataKey="store" tickLine={false} axisLine={false} tickMargin={10} tick={{ fontSize: 11 }} tickFormatter={storeShortName} interval={0} />
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
          <Tooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltip unitLabel={unitLabel} />} isAnimationActive={false} />
          <Bar dataKey="average" fill={COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
