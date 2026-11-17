import { Link } from 'react-router-dom'
import StatTile from '@/components/common/StatTile'
import { EM_DASH, formatDecimal, formatLeadTime, formatNumber, formatProbability, formatQuantity } from '@/lib/format'

/**
 * Expanded recommendation row (plan §7.3, reduced to the inputs that explain the advice): the full `reason`
 * and tiles for central stock, on order, the PO to expedite, daily demand, lead time, stockout probability and
 * supplier. The remaining model inputs (std, z, VED, pack size, MOQ, safety stock, order-up-to level) stay on the
 * Product Analysis page. Display only – nothing is computed here.
 * @param {{ row: import('@/api/shapes').RecommendationRow }} props
 */
export default function RecommendationDetails({ row }) {
  const d = row.details ?? {}
  const unit = row.unit
  const openPoHint = d.open_po_count != null ? `${formatNumber(d.open_po_count)} open PO${d.open_po_count === 1 ? '' : 's'}` : undefined

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0">
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Reason</h3>
        <p className="rounded-xl border border-border/70 bg-card px-4 py-3 text-sm leading-relaxed whitespace-normal text-foreground">{row.reason}</p>
      </div>
      <div className="min-w-0">
        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Inputs behind it</h3>
        <div className="grid grid-cols-2 gap-2 whitespace-normal sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3">
          <StatTile label="Current central stock" value={formatQuantity(d.current_stock, unit)} tone={d.current_stock === 0 ? 'danger' : undefined} />
          <StatTile label="On order" value={formatQuantity(d.on_order_qty, unit)} hint={openPoHint} />
          {d.purchase_order_id ? <StatTile label="PO to expedite" value={<span className="font-mono">{d.purchase_order_id}</span>} /> : null}
          <StatTile label="Daily demand P50" value={d.daily_demand_p50 != null ? `${formatDecimal(d.daily_demand_p50, 1)} ${unit ?? ''}`.trim() : EM_DASH} />
          <StatTile label="Lead time" value={d.lead_time_days != null ? formatLeadTime(d.lead_time_days, d.lead_time_std, d.lead_time_sample_size) : EM_DASH} />
          <StatTile label="Stockout probability" value={formatProbability(d.stockout_probability)} tone={d.stockout_probability != null && d.stockout_probability >= 0.2126 ? 'danger' : undefined} />
          <StatTile
            label="Supplier"
            value={
              d.supplier_id ? (
                <Link to={`/suppliers/${d.supplier_id}`} className="hover:text-primary hover:underline">
                  {d.supplier_name ?? d.supplier_id}
                </Link>
              ) : (
                EM_DASH
              )
            }
            hint={d.supplier_name && d.supplier_id ? d.supplier_id : undefined}
          />
        </div>
      </div>
    </div>
  )
}
