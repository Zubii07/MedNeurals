import { formatDate, formatQuantity } from '@/lib/format'
import { CENTRAL_STORE_ID } from '@/lib/enums'
import { cn } from '@/lib/utils'

/*
 * Stock per store for the product page (plan §7.6 item 5). Purchase orders and supplier statistics have their own
 * pages; the product page shows only incoming supply (StockAndSupplySection).
 */

/** Stock per store as a bar list; the central store is marked. */
export function StockByStoreList({ currentStock, unit }) {
  if (!currentStock) return <p className="text-sm text-muted-foreground">No inventory rows for this item.</p>
  const stores = currentStock.by_store ?? []
  const max = Math.max(1, ...stores.map((store) => store.closing_qty ?? 0))
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {formatQuantity(currentStock.total_qty, unit)} in total · as of {formatDate(currentStock.as_of_date)} · stock in one store is not available to another until it is transferred
      </p>
      <ul className="space-y-2.5">
        {stores.map((store) => {
          const central = store.store_id === CENTRAL_STORE_ID
          const empty = store.closing_qty === 0
          return (
            <li key={store.store_id}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate" title={store.store_name}>
                  {store.store_name}
                  {central ? <span className="ml-1 text-xs text-muted-foreground">(central)</span> : null}
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums', empty ? 'text-danger' : 'text-foreground')}>{empty ? 'Out of stock' : formatQuantity(store.closing_qty, unit)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', central ? 'bg-primary' : 'bg-success')} style={{ width: `${((store.closing_qty ?? 0) / max) * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
