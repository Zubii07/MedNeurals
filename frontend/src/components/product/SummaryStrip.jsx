import { Boxes, ShieldAlert, Sparkles, Truck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PriorityBadge, RiskBadge } from '@/components/common/ToneBadge'
import { ACTION_META, PRIORITY_META, RISK_LEVEL_META, enumMeta } from '@/lib/enums'
import { formatDate, formatNumber, formatProbability, formatQuantity, parseDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const ACCENT = {
  danger: 'before:bg-danger',
  warning: 'before:bg-warning',
  success: 'before:bg-success',
  primary: 'before:bg-primary',
  info: 'before:bg-info',
  violet: 'before:bg-violet',
  neutral: 'before:bg-border',
}

function SummaryCard({ icon: Icon, tone = 'neutral', label, children, footer }) {
  return (
    <Card className={cn('relative gap-3 overflow-hidden py-5 before:absolute before:inset-y-0 before:left-0 before:w-1 [--card-spacing:--spacing(5)]', ACCENT[tone] ?? ACCENT.neutral)}>
      <div className="flex items-center gap-2 px-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <div className="px-5">{children}</div>
      {footer ? <div className="px-5 text-xs text-muted-foreground">{footer}</div> : null}
    </Card>
  )
}

/** Whole days from one API date to another; null when either is missing. Date arithmetic only, no business logic. */
function daysBetween(from, to) {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return null
  return Math.round((end - start) / 86_400_000)
}

/** "in 8 days", "due today" or "3 days overdue" for a delivery expected `days` from the as-of date. */
function deliveryTiming(days) {
  if (days == null) return null
  if (days === 0) return 'Due today'
  if (days < 0) return `${formatNumber(-days)} day${days === -1 ? '' : 's'} overdue`
  return `Expected in ${formatNumber(days)} day${days === 1 ? '' : 's'}`
}

/**
 * The officer's four answers for this item, in reading order: how much is on hand, when the next delivery comes,
 * how likely a stockout is, and what to do. Every value is a persisted field from GET /products/{id}/analysis.
 * @param {{ analysis: import('@/api/shapes').ProductAnalysis }} props
 */
export default function SummaryStrip({ analysis }) {
  const unit = analysis.item?.uom
  const rec = analysis.recommendation
  const rows = rec?.rows ?? []
  const itemRow = rows.find((row) => row.action !== 'TRANSFER') ?? rows[0] ?? null
  const transfers = rows.filter((row) => row.action === 'TRANSFER').length
  const highest = analysis.stockout_risk?.highest ?? null
  const riskRows = analysis.stockout_risk?.by_store ?? []
  const urgentStores = riskRows.filter((row) => row.risk_level === 'URGENT').length
  const stock = analysis.current_stock
  const openOrders = analysis.open_purchase_orders
  const orders = openOrders?.orders ?? []
  const nextOrder = orders[0] ?? null // the backend sorts open orders by expected delivery date
  const daysToDelivery = nextOrder ? daysBetween(openOrders.as_of_date, nextOrder.expected_delivery_date) : null

  const recTone = itemRow ? enumMeta(PRIORITY_META, itemRow.priority).tone : 'neutral'
  const riskTone = highest ? enumMeta(RISK_LEVEL_META, highest.risk_level).tone : 'neutral'
  const stockTone = stock ? (stock.total_qty === 0 ? 'danger' : stock.central_store_qty === 0 ? 'warning' : 'success') : 'neutral'
  const deliveryTone = !nextOrder ? 'neutral' : daysToDelivery != null && daysToDelivery < 0 ? 'warning' : 'info'

  let quantityLine = null
  if (itemRow?.action === 'PURCHASE') quantityLine = `Order ${formatQuantity(itemRow.recommended_purchase_quantity, unit)}`
  else if (itemRow?.action === 'TRANSFER') quantityLine = `Move ${formatQuantity(itemRow.transfer_quantity, unit)}`
  else if (itemRow?.action === 'EXPEDITE_PO' && itemRow.details?.purchase_order_id) quantityLine = `Chase ${itemRow.details.purchase_order_id}`
  else if (itemRow?.action === 'NONE') quantityLine = 'Stock position is adequate'

  let deliveryFooter
  if (nextOrder) {
    const more = orders.length - 1
    deliveryFooter = `${formatQuantity(nextOrder.ordered_quantity, unit)} on order${more > 0 ? ` · ${formatNumber(more)} more open order${more === 1 ? '' : 's'}` : ''}`
  } else if (openOrders?.as_of_date) {
    deliveryFooter = `As of ${formatDate(openOrders.as_of_date)}`
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={Boxes} tone={stockTone} label="Stock on hand" footer={stock ? `As of ${formatDate(stock.as_of_date)}` : undefined}>
        {!stock ? (
          <p className="text-sm text-muted-foreground">No inventory rows for this item.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tabular-nums text-foreground">{formatQuantity(stock.total_qty, unit)}</span>
              <span className="text-xs text-muted-foreground">all stores</span>
            </div>
            <p className="mt-1 text-sm text-foreground">
              Central store <span className={cn('font-semibold tabular-nums', stock.central_store_qty === 0 && 'text-danger')}>{formatNumber(stock.central_store_qty)}</span>
            </p>
          </>
        )}
      </SummaryCard>

      <SummaryCard icon={Truck} tone={deliveryTone} label="Next delivery" footer={deliveryFooter}>
        {!openOrders ? (
          <p className="text-sm text-muted-foreground">No order data for this item.</p>
        ) : !nextOrder ? (
          <>
            <span className="text-xl font-semibold text-foreground">Nothing on order</span>
            <p className="mt-1 text-sm text-muted-foreground">No open purchase orders.</p>
          </>
        ) : (
          <>
            <span className="text-xl font-semibold tabular-nums text-foreground">{formatDate(nextOrder.expected_delivery_date)}</span>
            <p className={cn('mt-1 text-sm font-medium', deliveryTone === 'warning' ? 'text-[#b45309]' : 'text-foreground')}>
              {deliveryTiming(daysToDelivery) ?? 'Expected delivery'}
              {nextOrder.supplier_id ? <span className="font-normal text-muted-foreground"> · {nextOrder.supplier_id}</span> : null}
            </p>
          </>
        )}
      </SummaryCard>

      <SummaryCard
        icon={ShieldAlert}
        tone={riskTone}
        label="Stockout risk"
        footer={riskRows.length ? `${formatNumber(riskRows.length)} stores · ${formatNumber(urgentStores)} urgent · next ${highest?.horizon_days ?? 14} days` : undefined}
      >
        {!analysis.stockout_risk ? (
          <p className="text-sm text-muted-foreground">No predictions yet.</p>
        ) : !highest ? (
          <p className="text-sm text-muted-foreground">No stockout prediction for this item.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('text-xl font-semibold tabular-nums', riskTone === 'danger' ? 'text-danger' : 'text-foreground')}>{formatProbability(highest.probability)}</span>
              <RiskBadge level={highest.risk_level} />
            </div>
            <p className="mt-1 truncate text-sm font-medium text-foreground" title={highest.store_name}>
              Highest at {highest.store_name}
            </p>
          </>
        )}
      </SummaryCard>

      <SummaryCard icon={Sparkles} tone={recTone} label="Recommended action" footer={transfers ? `+ ${transfers} transfer${transfers === 1 ? '' : 's'} between stores` : undefined}>
        {!rec ? (
          <p className="text-sm text-muted-foreground">No predictions yet.</p>
        ) : rec.item_status !== 'available' || !itemRow ? (
          <p className="text-sm text-muted-foreground">{rec.item_status === 'set_missing' ? 'Recommendations are missing.' : 'No recommendation for this item.'}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold text-foreground">{enumMeta(ACTION_META, itemRow.action).label}</span>
              <PriorityBadge priority={itemRow.priority} />
            </div>
            {quantityLine ? <p className="mt-1 text-sm font-medium text-foreground">{quantityLine}</p> : null}
          </>
        )}
      </SummaryCard>
    </div>
  )
}
