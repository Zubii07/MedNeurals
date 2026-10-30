import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ForecastChart from '@/components/charts/ForecastChart'
import SectionCard from './SectionCard'
import StatTile from '@/components/common/StatTile'
import { formatDate, formatForecast, horizonLabel } from '@/lib/format'
import { storeName } from '@/lib/enums'
import { cn } from '@/lib/utils'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

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

/**
 * Demand forecast (plan §7.6 item 4): chart of `totals` (P50, P90 sum) for H1–H4, a tile per week,
 * and the by-store table behind a toggle.
 * @param {{ forecast: import('@/api/shapes').ProductAnalysis['forecast'], unit: string, itemId: string }} props
 */
export default function ForecastSection({ forecast, unit, itemId }) {
  const [showStores, setShowStores] = useState(false)
  const totals = useMemo(() => [...(forecast?.totals ?? [])].sort((a, b) => a.horizon - b.horizon), [forecast])
  const stores = useMemo(() => pivotByStore(forecast?.by_store ?? []), [forecast])
  const horizons = totals.length ? totals.map((t) => t.horizon) : [1, 2, 3, 4]

  let body
  if (!forecast) {
    body = <EmptyState icon={TrendingUp} title="No prediction run yet." compact />
  } else if (totals.length === 0 && stores.length === 0) {
    body = <EmptyState icon={TrendingUp} title="No demand forecast for this item in the latest run." compact />
  } else {
    body = (
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_14rem]">
          {totals.length > 0 ? <ForecastChart rows={totals} unit={unit} className="aspect-auto h-[220px] w-full" /> : null}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {totals.map((row) => (
              <StatTile
                key={row.horizon}
                label={`${horizonLabel(row.horizon)} · week of ${formatDate(row.target_week)}`}
                value={`${formatForecast(row.p50)} ${unit ?? ''}`}
                hint={`P90 (sum) ${formatForecast(row.p90_sum)}`}
              />
            ))}
          </div>
        </div>

        {stores.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowStores((value) => !value)}
              aria-expanded={showStores}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', showStores && 'rotate-180')} />
              {showStores ? 'Hide' : 'Show'} forecast per sub-store ({stores.length})
            </button>
            {showStores ? (
              <div className="mt-3">
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
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <SectionCard
      icon={TrendingUp}
      tone="info"
      title="Demand forecast"
      description={`Weekly demand for the next four weeks${unit ? ` in ${unit}` : ''} · P90 is the sum of sub-store P90s`}
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
