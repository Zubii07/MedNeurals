import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import DemandHistoryChart from '@/components/charts/DemandHistoryChart'
import SectionCard from './SectionCard'
import { useWeeklyDemand } from '@/api/hooks'
import { formatForecast, formatNumber, horizonLabel } from '@/lib/format'
import { storeName } from '@/lib/enums'
import { cn } from '@/lib/utils'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'
/** Weeks of recorded demand drawn before the four forecast weeks. */
const HISTORY_WEEKS = 26

/** Pivot ForecastRow[] into one row per store with a cell per horizon (grouping already-returned rows). */
function pivotByStore(rows) {
  const byStore = new Map()
  for (const row of rows) {
    const entry = byStore.get(row.store_id) ?? { store_id: row.store_id, store_name: row.store_name ?? storeName(row.store_id), horizons: {} }
    entry.horizons[row.horizon] = row
    byStore.set(row.store_id, entry)
  }
  return [...byStore.values()].sort((a, b) => a.store_id.localeCompare(b.store_id))
}

function Toggle({ open, onToggle, label }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
      <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', open && 'rotate-180')} />
      {label}
    </button>
  )
}

/**
 * "How much will we need?" (plan §7.6 item 4): one line chart of the item's weekly demand, all sub-stores together:
 * the last 26 recorded weeks (GET /demand/weekly) and the four forecast weeks (`totals`). The P50-P90 range and the
 * per-store table are optional details.
 * @param {{ forecast: import('@/api/shapes').ProductAnalysis['forecast'], unit: string, itemId: string, predictionDate?: string | null }} props
 */
export default function ForecastSection({ forecast, unit, itemId, predictionDate }) {
  const [showStores, setShowStores] = useState(false)
  const [showRange, setShowRange] = useState(false)
  const totals = useMemo(() => [...(forecast?.totals ?? [])].sort((a, b) => a.horizon - b.horizon), [forecast])
  const stores = useMemo(() => pivotByStore(forecast?.by_store ?? []), [forecast])
  const horizons = totals.length ? totals.map((t) => t.horizon) : [1, 2, 3, 4]
  const forecastRows = useMemo(() => totals.map((t) => ({ target_week: t.target_week, p50: t.p50, p90: t.p90_sum })), [totals])
  const history = useWeeklyDemand({ item_id: itemId, weeks: HISTORY_WEEKS, end_date: predictionDate ?? undefined }, { enabled: Boolean(itemId && predictionDate) })

  let body
  if (!forecast) {
    body = <EmptyState icon={TrendingUp} title="No predictions yet." compact />
  } else if (totals.length === 0 && stores.length === 0) {
    body = <EmptyState icon={TrendingUp} title="No demand forecast for this item in the latest run." compact />
  } else {
    let chart
    if (history.isPending) chart = <Skeleton className="h-[260px] w-full" />
    else if (history.isError) chart = <ErrorState error={history.error} onRetry={history.refetch} retrying={history.isFetching} compact />
    else chart = <DemandHistoryChart history={history.data?.weeks ?? []} forecast={forecastRows} unit={unit} showRange={showRange} />

    body = (
      <div className="space-y-4">
        {chart}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Toggle open={showRange} onToggle={() => setShowRange((value) => !value)} label={`${showRange ? 'Hide' : 'Show'} the high estimate (P90) range`} />
          {stores.length > 0 ? <Toggle open={showStores} onToggle={() => setShowStores((value) => !value)} label={`${showStores ? 'Hide' : 'Show'} forecast per sub-store (${formatNumber(stores.length)})`} /> : null}
        </div>

        {showStores && stores.length > 0 ? (
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className={HEAD}>Store</TableHead>
                {horizons.map((h) => (
                  <TableHead key={h} className={`${HEAD} text-right`}>
                    {horizonLabel(h)} <span className="font-normal">P50 / P90</span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.store_id} className="border-border/70">
                  <TableCell className="px-2 py-2">
                    <span className="text-sm font-medium">{store.store_name}</span>
                    <span className="block text-xs text-muted-foreground">{store.store_id}</span>
                  </TableCell>
                  {horizons.map((h) => {
                    const cell = store.horizons[h]
                    return (
                      <TableCell key={h} className="px-2 py-2 text-right tabular-nums">
                        {cell ? (
                          <>
                            <span className="font-medium">{formatForecast(cell.p50)}</span>
                            <span className="text-muted-foreground"> / {formatForecast(cell.p90)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </div>
    )
  }

  return (
    <SectionCard
      icon={TrendingUp}
      tone="info"
      title="How much will we need?"
      description={`Weekly demand${unit ? ` in ${unit}` : ''}, all stores together: the last ${HISTORY_WEEKS} weeks and the next four`}
      action={
        <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-accent">
          <Link to={`/forecasts?item_id=${encodeURIComponent(itemId)}`}>
            Forecasts
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {body}
    </SectionCard>
  )
}
