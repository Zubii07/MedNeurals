import Expandable from '@/components/common/Expandable'
import { StockByStoreList } from './LiveContextSection'
import { EM_DASH, formatDate, formatNumber, formatQuantity, parseDate } from '@/lib/format'
import { cn } from '@/lib/utils'

function daysBetween(from, to) {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return null
  return Math.round((end - start) / 86_400_000)
}

/** Delivery status in plain words, from the expected date and the as-of date of the stock figures. */
function deliveryStatus(days) {
  if (days == null) return { text: 'Expected date unknown', overdue: false }
  if (days > 0) return { text: `Expected in ${formatNumber(days)} day${days === 1 ? '' : 's'}`, overdue: false }
  if (days === 0) return { text: 'Due today', overdue: false }
  return { text: `Overdue by ${formatNumber(-days)} day${days === -1 ? '' : 's'}`, overdue: true }
}

/** Open purchase orders as incoming supply: quantity, supplier, expected date and status. Nothing else. */
function IncomingSupplyList({ openOrders, unit }) {
  const orders = openOrders?.orders ?? []
  return (
    <ul className="divide-y divide-border/60">
      {orders.map((order) => {
        const status = deliveryStatus(daysBetween(openOrders.as_of_date, order.expected_delivery_date))
        return (
          <li key={order.purchase_order_id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {formatQuantity(order.ordered_quantity, unit)} <span className="font-normal text-muted-foreground">from {order.supplier_id} to the central store</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Expected {formatDate(order.expected_delivery_date)} · order {order.purchase_order_id}
              </p>
            </div>
            <span className={cn('shrink-0 text-sm font-medium', status.overdue ? 'text-danger' : 'text-foreground')}>{status.text}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Section 4 – where stock is and what is on its way: stock by store (open by default, so a transfer can be judged)
 * and, only when an open order exists, the incoming supply with its delivery status.
 * @param {{ analysis: import('@/api/shapes').ProductAnalysis }} props
 */
export default function StockAndSupplySection({ analysis }) {
  const unit = analysis.item?.uom
  const stock = analysis.current_stock
  const orders = analysis.open_purchase_orders
  const openOrders = orders?.orders ?? []
  const next = openOrders[0] ?? null

  return (
    <section aria-labelledby="supply-heading" className="space-y-3">
      <h2 id="supply-heading" className="text-base font-semibold text-foreground">
        Stock by store and incoming supply
      </h2>
      <div className="grid gap-3">
        <Expandable
          title="Stock by store"
          description={stock ? `${formatQuantity(stock.total_qty, unit)} across ${formatNumber(stock.by_store?.length ?? 0)} stores · central store ${stock.central_store_qty == null ? EM_DASH : formatNumber(stock.central_store_qty)}` : 'No inventory rows'}
          defaultOpen
        >
          <StockByStoreList currentStock={stock} unit={unit} />
        </Expandable>
        {openOrders.length > 0 ? (
          <Expandable
            title="Incoming supply"
            description={`${formatNumber(openOrders.length)} open order${openOrders.length === 1 ? '' : 's'} · ${formatQuantity(orders.quantity, unit)} · next expected ${formatDate(next.expected_delivery_date)}`}
          >
            <IncomingSupplyList openOrders={orders} unit={unit} />
          </Expandable>
        ) : null}
      </div>
    </section>
  )
}
