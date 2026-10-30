import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, ClipboardList, Truck } from 'lucide-react'
import EmptyState from '@/components/common/EmptyState'
import SectionCard from './SectionCard'
import StatTile from '@/components/common/StatTile'
import { formatDate, formatDecimal, formatNumber, formatPercent, formatQuantity } from '@/lib/format'
import { CENTRAL_STORE_ID } from '@/lib/enums'
import { cn } from '@/lib/utils'

function CurrentStockCard({ currentStock, unit }) {
  if (!currentStock) {
    return (
      <SectionCard icon={Boxes} title="Stock by store" tone="success">
        <EmptyState icon={Boxes} title="No inventory rows for this item." compact />
      </SectionCard>
    )
  }
  const stores = currentStock.by_store ?? []
  const max = Math.max(1, ...stores.map((store) => store.closing_qty ?? 0))
  return (
    <SectionCard icon={Boxes} tone="success" title="Stock by store" description={`${formatQuantity(currentStock.total_qty, unit)} in total · as of ${formatDate(currentStock.as_of_date)}`}>
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
                <span className={cn('shrink-0 font-semibold tabular-nums', empty ? 'text-danger' : 'text-foreground')}>{empty ? 'Out of stock' : formatNumber(store.closing_qty)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', central ? 'bg-primary' : 'bg-success')} style={{ width: `${((store.closing_qty ?? 0) / max) * 100}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </SectionCard>
  )
}

function OpenOrdersCard({ openOrders, unit }) {
  const orders = openOrders?.orders ?? []
  return (
    <SectionCard
      icon={ClipboardList}
      tone="violet"
      title="Open purchase orders"
      description={openOrders ? `${formatQuantity(openOrders.quantity, unit)} on order · as of ${formatDate(openOrders.as_of_date)}` : undefined}
    >
      {!openOrders || orders.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing on order for this item." compact />
      ) : (
        <ul className="divide-y divide-border/60">
          {orders.map((order) => (
            <li key={order.purchase_order_id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-medium text-foreground">{order.purchase_order_id}</span>
                <span className="font-semibold tabular-nums">{formatQuantity(order.ordered_quantity, unit)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Expected <span className="font-medium text-foreground">{formatDate(order.expected_delivery_date)}</span>
                {' · ordered '}
                {formatDate(order.order_date)}
                {' · '}
                <Link to={`/suppliers/${order.supplier_id}`} className="hover:text-primary hover:underline">
                  {order.supplier_id}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

const NOT_ENOUGH = 'Not enough data'

function SupplierCard({ supplier }) {
  const lt = supplier.lead_time ?? {}
  return (
    <SectionCard
      icon={Truck}
      tone="primary"
      title={supplier.supplier_name}
      description={`Preferred supplier · ${supplier.supplier_id}`}
      action={
        <Link to={`/suppliers/${supplier.supplier_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Details
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Lead time" value={lt.mean_days != null ? `${formatDecimal(lt.mean_days, 1)} d` : NOT_ENOUGH} hint={lt.std_dev_days != null ? `± ${formatDecimal(lt.std_dev_days, 1)} days` : undefined} />
        <StatTile label="On time" value={supplier.on_time_rate == null ? NOT_ENOUGH : formatPercent(supplier.on_time_rate, 0)} hint="deliveries" />
        <StatTile label="Fill rate" value={supplier.fill_rate == null ? NOT_ENOUGH : formatPercent(supplier.fill_rate, 1)} hint="quantity" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <dt>Median / range</dt>
        <dd className="text-right tabular-nums text-foreground">
          {lt.median_days != null ? `${formatDecimal(lt.median_days, 1)} d` : '—'}
          {lt.min_days != null && lt.max_days != null ? ` · ${formatNumber(lt.min_days)}–${formatNumber(lt.max_days)} d` : ''}
        </dd>
        <dt>Based on</dt>
        <dd className="text-right tabular-nums text-foreground">{lt.sample_size != null ? `${formatNumber(lt.sample_size)} orders` : '—'}{supplier.as_of ? ` · as of ${formatDate(supplier.as_of)}` : ''}</dd>
        <dt>Contract lead time</dt>
        <dd className="text-right tabular-nums text-foreground">{formatNumber(supplier.contract_lead_time_days)} days</dd>
        <dt>Minimum order</dt>
        <dd className="text-right tabular-nums text-foreground">{formatNumber(supplier.minimum_order_quantity)} packs</dd>
      </dl>
    </SectionCard>
  )
}

/**
 * Live context (plan §7.6 item 5): current stock, open POs and preferred suppliers – current data, not part of the prediction run.
 * @param {{ analysis: import('@/api/shapes').ProductAnalysis }} props
 */
export default function LiveContextSection({ analysis }) {
  const unit = analysis.item?.uom
  const suppliers = analysis.preferred_suppliers ?? []
  return (
    <div className="space-y-4">
      <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Live data · not part of the prediction run</p>
      <CurrentStockCard currentStock={analysis.current_stock} unit={unit} />
      <OpenOrdersCard openOrders={analysis.open_purchase_orders} unit={unit} />
      {suppliers.length === 0 ? (
        <SectionCard icon={Truck} title="Preferred supplier">
          <EmptyState icon={Truck} title="No preferred supplier on file for this item." compact />
        </SectionCard>
      ) : (
        suppliers.map((supplier) => <SupplierCard key={supplier.supplier_id} supplier={supplier} />)
      )}
    </div>
  )
}
