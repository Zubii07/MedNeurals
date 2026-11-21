import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import DecisionPanel from './DecisionPanel'
import { storeName } from '@/lib/enums'
import { EM_DASH, formatDate, formatNumber, formatProbability, formatQuantity, parseDate } from '@/lib/format'
import { actionSentence } from '@/lib/recommendation-text'
import { cn } from '@/lib/utils'

function daysBetween(from, to) {
  const start = parseDate(from)
  const end = parseDate(to)
  if (!start || !end) return null
  return Math.round((end - start) / 86_400_000)
}

/** Expected delivery of the PO to chase, judged against the prediction date the advice was made on. */
function deliveryFact(row) {
  const d = row.details ?? {}
  if (!d.purchase_order_id) return null
  if (d.purchase_order_received) return { label: 'Expected delivery', value: 'Already received' }
  const date = d.purchase_order_expected_delivery_date
  if (!date) return { label: 'Expected delivery', value: 'Not known' }
  const days = daysBetween(row.prediction_date, date)
  let note = ''
  let tone
  if (days != null && days < 0) {
    note = `overdue by ${formatNumber(-days)} day${days === -1 ? '' : 's'}`
    tone = 'danger'
  } else if (days === 0) note = 'due on the prediction date'
  else if (days != null) note = `${formatNumber(days)} day${days === 1 ? '' : 's'} after the prediction date`
  return { label: 'Expected delivery', value: formatDate(date), note, tone }
}

/** Only the quantities that matter for this action: never the same number under two names. */
function factsFor(row) {
  const d = row.details ?? {}
  const unit = row.unit
  const qty = (value) => (value == null ? EM_DASH : value === 0 ? 'None' : formatQuantity(value, unit))
  const ordered = d.on_order_qty > 0
    ? { label: 'Already ordered', value: formatQuantity(d.on_order_qty, unit), note: d.open_po_count ? `${formatNumber(d.open_po_count)} open order${d.open_po_count === 1 ? '' : 's'}` : '' }
    : { label: 'Already ordered', value: 'Nothing on order' }
  const central = { label: 'Available at central store', value: qty(d.current_stock), tone: d.current_stock === 0 ? 'danger' : undefined }
  const supplier = { label: 'Supplier', value: d.supplier_name ?? EM_DASH, note: d.supplier_id }
  const risk = { label: row.action === 'TRANSFER' ? 'Chance this store runs out' : 'Highest chance of running out', value: formatProbability(d.stockout_probability), note: 'within 14 days', tone: d.stockout_probability >= 0.2126 ? 'danger' : undefined }

  switch (row.action) {
    case 'EXPEDITE_PO':
      return [central, { ...ordered, label: 'On the order to chase' }, { label: 'Purchase order', value: d.purchase_order_id ?? EM_DASH, mono: true }, deliveryFact(row), supplier, risk].filter(Boolean)
    case 'PURCHASE': {
      const packs = d.pack_size > 1 && row.recommended_purchase_quantity % d.pack_size === 0 ? `${formatNumber(row.recommended_purchase_quantity / d.pack_size)} packs of ${formatNumber(d.pack_size)}` : ''
      return [
        { label: 'New order recommended', value: formatQuantity(row.recommended_purchase_quantity, unit), note: packs, strong: true },
        central,
        ordered,
        supplier,
        risk,
      ]
    }
    case 'TRANSFER':
      return [
        { label: `Move to ${row.store_name ?? storeName(row.store_id)}`, value: formatQuantity(row.transfer_quantity, unit), strong: true },
        central,
        risk,
      ]
    default:
      return [central, ordered, risk]
  }
}

/**
 * Expanded recommendation (plan §7.3, officer view): the action in one sentence, why in plain words, and one short
 * list of the quantities that matter for this action, the supplier, the purchase order and its delivery date when
 * relevant, and the officer's decision (Accept | Adjust | Reject while pending, DecisionPanel). Reorder points,
 * inventory position, demand and lead-time statistics stay in the backend. Display only – nothing is computed here
 * beyond date differences and pack arithmetic for display.
 * @param {{ row: import('@/api/shapes').RecommendationRow, isLatestSet?: boolean }} props
 */
export default function RecommendationDetails({ row, isLatestSet = true }) {
  const facts = factsFor(row)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-5">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recommended action</p>
          <p className="mt-1 text-base font-semibold text-foreground">{actionSentence(row)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Why</p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">{row.reason}</p>
        </div>
        <DecisionPanel row={row} isLatestSet={isLatestSet} />
        <Link to={`/products/${encodeURIComponent(row.product_id)}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Open product
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <dl className="min-w-0 divide-y divide-border/60 rounded-xl border border-border/70 bg-card px-4">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-sm text-muted-foreground">{fact.label}</dt>
            <dd className="text-right">
              <span className={cn('block text-sm font-semibold tabular-nums', fact.tone === 'danger' ? 'text-danger' : 'text-foreground', fact.mono && 'font-mono', fact.strong && 'text-base')}>{fact.value}</span>
              {fact.note ? <span className={cn('block text-xs', fact.tone === 'danger' ? 'text-danger' : 'text-muted-foreground')}>{fact.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
