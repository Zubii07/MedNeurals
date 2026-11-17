import { Card } from '@/components/ui/card'
import { CENTRAL_STORE_ID } from '@/lib/enums'
import { EM_DASH, formatDate, formatDecimal, formatNumber, formatQuantity, parseDate } from '@/lib/format'
import { cn } from '@/lib/utils'

function Tile({ label, value, lines = [], danger = false }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-4 py-3.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', danger ? 'text-danger' : 'text-foreground')}>{value}</p>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 text-xs text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  )
}

/** How long the store's own stock lasts at its recent rate of use, in plain words. */
function coverLine(storeQty, cover, daily) {
  if (storeQty === 0) return 'No stock at this store to cover it'
  if (daily === 0) return 'No use recorded recently'
  if (cover == null) return ''
  const days = Math.round(cover)
  if (days < 1) return 'Current stock covers less than a day'
  return `Current stock covers about ${formatNumber(days)} day${days === 1 ? '' : 's'}`
}

function daysBetween(from, to) {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return null
  return Math.round((end - start) / 86_400_000)
}

/**
 * Section 3 – the four stock facts an officer needs: total stock (central and sub-stores shown apart), stock at the
 * store at risk (with what is in transit to it), recent daily use there, and the next expected delivery. Stock held
 * elsewhere is never presented as available to the store at risk.
 * @param {{ analysis: import('@/api/shapes').ProductAnalysis }} props
 */
export default function InventorySummary({ analysis }) {
  const unit = analysis.item?.uom
  const stock = analysis.current_stock
  const highest = analysis.stockout_risk?.highest ?? null
  const orders = analysis.open_purchase_orders
  const nextOrder = orders?.orders?.[0] ?? null
  const asOf = stock?.as_of_date ?? orders?.as_of_date ?? null

  const central = stock?.central_store_qty ?? null
  const subStores = stock && central != null ? stock.total_qty - central : null
  const storeRow = highest ? stock?.by_store?.find((row) => row.store_id === highest.store_id) : null
  const storeQty = storeRow?.closing_qty ?? highest?.stock_on_hand ?? null
  const inTransit = highest?.in_transit_qty ?? null
  const daily = highest?.adu_28 ?? null
  const cover = highest?.days_of_cover ?? null
  const dueIn = nextOrder ? daysBetween(asOf, nextOrder.expected_delivery_date) : null

  const storeName = highest?.store_name ?? 'the store at risk'

  return (
    <section aria-labelledby="inventory-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="inventory-heading" className="text-base font-semibold text-foreground">
          Current inventory
        </h2>
        {asOf ? <p className="text-xs text-muted-foreground">As of {formatDate(asOf)}</p> : null}
      </div>
      <Card className="gap-0 px-4 py-4 [--card-spacing:0]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Total stock, all stores"
            value={stock ? formatQuantity(stock.total_qty, unit) : EM_DASH}
            danger={stock?.total_qty === 0}
            lines={stock ? [`Central store: ${formatNumber(central)} · sub-stores: ${formatNumber(subStores)}`, 'Stock in other stores needs a transfer first'] : ['No inventory rows for this product']}
          />
          <Tile
            label={highest ? `Stock at ${storeName}` : 'Stock at the store at risk'}
            value={storeQty == null ? EM_DASH : storeQty === 0 ? 'None' : formatQuantity(storeQty, unit)}
            danger={storeQty === 0}
            lines={highest ? [inTransit != null ? (inTransit > 0 ? `${formatQuantity(inTransit, unit)} in transit to this store` : 'Nothing in transit to this store') : 'Transit quantity not saved for this run'] : ['No store is flagged in the latest predictions']}
          />
          <Tile
            label="Recent daily use"
            value={daily == null ? EM_DASH : daily > 0 ? `${formatDecimal(daily, 1)} ${unit ?? ''}`.trim() : 'None'}
            lines={highest ? [`At ${storeName}, average of the last 28 days`, coverLine(storeQty, cover, daily)].filter(Boolean) : []}
          />
          <Tile
            label="Next expected delivery"
            value={nextOrder ? formatDate(nextOrder.expected_delivery_date) : orders ? 'Nothing on order' : EM_DASH}
            lines={nextOrder ? [dueIn == null ? '' : dueIn > 0 ? `In ${formatNumber(dueIn)} day${dueIn === 1 ? '' : 's'}` : dueIn === 0 ? 'Due today' : `${formatNumber(-dueIn)} day${dueIn === -1 ? '' : 's'} overdue`, `${formatQuantity(nextOrder.ordered_quantity, unit)} to the central store (${nextOrder.supplier_id})`].filter(Boolean) : orders ? ['No open purchase orders'] : []}
            danger={dueIn != null && dueIn < 0}
          />
        </div>
        {highest && highest.store_id !== CENTRAL_STORE_ID && central > 0 && storeQty === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">The central store holds {formatQuantity(central, unit)}, which could be transferred to {storeName}; it is not counted as available there.</p>
        ) : null}
      </Card>
    </section>
  )
}
