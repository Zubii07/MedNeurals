import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { storeName, storeShortName } from '@/lib/enums'

const chartConfig = {
  urgent: { label: 'Urgent', color: 'var(--danger)' },
  review: { label: 'Review', color: 'var(--warning)' },
}

/**
 * Group URGENT and REVIEW store×item rows by store (counting only – plan §2 rule 3 allows it).
 * @param {import('@/api/shapes').StockoutRiskRow[]} urgentRows
 * @param {import('@/api/shapes').StockoutRiskRow[]} reviewRows
 */
function groupRisksByStore(urgentRows, reviewRows) {
  const byStore = new Map()
  const bump = (row, key) => {
    const entry = byStore.get(row.store_id) ?? {
      store_id: row.store_id,
      store: storeShortName(row.store_id),
      name: row.store_name ?? storeName(row.store_id),
      urgent: 0,
      review: 0,
    }
    entry[key] += 1
    byStore.set(row.store_id, entry)
  }
  urgentRows.forEach((row) => bump(row, 'urgent'))
  reviewRows.forEach((row) => bump(row, 'review'))
  return [...byStore.values()].sort((a, b) => b.urgent - a.urgent || b.review - a.review || a.store.localeCompare(b.store))
}

/**
 * Stacked bars per sub-store: URGENT (red) over REVIEW (amber); y = number of at-risk store×item rows.
 * @param {{ urgentRows: import('@/api/shapes').StockoutRiskRow[], reviewRows: import('@/api/shapes').StockoutRiskRow[], className?: string }} props
 */
export default function RiskByStoreChart({ urgentRows, reviewRows, className }) {
  const data = useMemo(() => groupRisksByStore(urgentRows ?? [], reviewRows ?? []), [urgentRows, reviewRows])

  return (
    <ChartContainer config={chartConfig} className={className ?? 'aspect-auto h-[190px] w-full'}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="store" tickLine={false} axisLine={false} tickMargin={4} interval={0} angle={-40} textAnchor="end" height={62} tick={{ fontSize: 10 }} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} tick={{ fontSize: 10 }} width={40} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ''} />}
        />
        <Bar dataKey="review" stackId="risk" fill="var(--color-review)" stroke="var(--card)" strokeWidth={1} radius={[0, 0, 4, 4]} />
        <Bar dataKey="urgent" stackId="risk" fill="var(--color-urgent)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
