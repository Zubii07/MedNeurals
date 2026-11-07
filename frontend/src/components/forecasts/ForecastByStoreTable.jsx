import { useMemo } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EM_DASH, formatDate, formatForecast, horizonLabel } from '@/lib/format'
import { storeName } from '@/lib/enums'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'
const HORIZONS = [1, 2, 3, 4]

/** Pivot ForecastRow[] into one row per store with a cell per horizon (grouping already-returned rows, plan §2 rule 3). */
function pivotByStore(rows) {
  const byStore = new Map()
  const weeks = {}
  for (const row of rows) {
    const entry = byStore.get(row.store_id) ?? { store_id: row.store_id, store_name: row.store_name ?? storeName(row.store_id), horizons: {} }
    entry.horizons[row.horizon] = row
    byStore.set(row.store_id, entry)
    weeks[row.horizon] ??= row.target_week
  }
  return { stores: [...byStore.values()].sort((a, b) => a.store_id.localeCompare(b.store_id)), weeks }
}

/**
 * "All stores" view (plan §7.5): one row per sub-store, H1–H4 columns of P50 / P90.
 * @param {{ rows: import('@/api/shapes').ForecastRow[], unit?: string }} props
 */
export default function ForecastByStoreTable({ rows, unit }) {
  const { stores, weeks } = useMemo(() => pivotByStore(rows ?? []), [rows])

  return (
    <Table className="min-w-[680px]">
      <TableHeader>
        <TableRow className="border-0 hover:bg-transparent">
          <TableHead className={HEAD}>Store</TableHead>
          {HORIZONS.map((h) => (
            <TableHead key={h} className={`${HEAD} text-right`}>
              {horizonLabel(h)}
              {weeks[h] ? <span className="block text-[11px] font-normal">week of {formatDate(weeks[h])}</span> : null}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {stores.map((store) => (
          <TableRow key={store.store_id} className="border-border/70">
            <TableCell className="px-2 py-2.5">
              <span className="block max-w-[260px] truncate text-sm font-medium" title={store.store_name}>
                {store.store_name}
              </span>
              <span className="block text-xs text-muted-foreground">{store.store_id}</span>
            </TableCell>
            {HORIZONS.map((h) => {
              const cell = store.horizons[h]
              return (
                <TableCell key={h} className="px-2 py-2.5 text-right text-sm tabular-nums">
                  {cell ? (
                    <>
                      <span className="font-semibold">{formatForecast(cell.p50)}</span>
                      <span className="text-muted-foreground"> / {formatForecast(cell.p90)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">{EM_DASH}</span>
                  )}
                </TableCell>
              )
            })}
          </TableRow>
        ))}
      </TableBody>
      <caption className="pt-3 text-left text-xs text-muted-foreground">
        P50 / P90{unit ? ` in ${unit}` : ''} per week, per sub-store.
      </caption>
    </Table>
  )
}
