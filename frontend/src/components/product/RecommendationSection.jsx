import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EmptyState from '@/components/common/EmptyState'
import StaleBanner from '@/components/common/StaleBanner'
import { ActionBadge, PriorityBadge } from '@/components/common/ToneBadge'
import SectionCard from './SectionCard'
import StatTile from '@/components/common/StatTile'
import { formatDateTime, formatDecimal, formatNumber, formatPercent, formatQuantity, runLabel } from '@/lib/format'
import { PRIORITY_META, enumMeta, storeName } from '@/lib/enums'

/**
 * Saved recommendation for the item (plan §7.6 item 2): badges, reason, the inputs behind it, and transfers.
 * @param {{ recommendation: import('@/api/shapes').ProductAnalysis['recommendation'], unit: string }} props
 */
export default function RecommendationSection({ recommendation, unit }) {
  const set = recommendation?.recommendation_set
  const rows = recommendation?.rows ?? []
  const itemRow = rows.find((row) => row.action !== 'TRANSFER') ?? null
  const transferRows = rows.filter((row) => row.action === 'TRANSFER')
  const stale = set?.model_run_id != null && set?.latest_available_model_run_id != null && set.model_run_id !== set.latest_available_model_run_id
  const tone = itemRow ? enumMeta(PRIORITY_META, itemRow.priority).tone : 'primary'

  let body
  if (!recommendation) {
    body = <EmptyState icon={Sparkles} title="No prediction run yet, so there is no saved recommendation." to="/data" linkLabel="Go to Data & Predictions" compact />
  } else if (recommendation.item_status === 'set_missing' || set?.status === 'missing') {
    body = <StaleBanner title="Recommendations for the latest prediction run are missing." description="Generate them from Data & Predictions." to="/data" actionLabel="Generate recommendations" />
  } else if (recommendation.item_status === 'item_not_included' || rows.length === 0) {
    body = <EmptyState icon={Sparkles} title="No recommendation for this item in the latest set (inputs were incomplete)." compact />
  } else {
    const d = itemRow?.details ?? {}
    body = (
      <div className="space-y-5">
        {stale ? (
          <StaleBanner
            title={`This set belongs to run ${runLabel(set.model_run_id)}; the latest prediction run is ${runLabel(set.latest_available_model_run_id)}.`}
            to="/data"
            actionLabel="Open Data & Predictions"
          />
        ) : null}

        {itemRow ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={itemRow.action} className="h-7 px-3 text-[13px]" />
              <PriorityBadge priority={itemRow.priority} className="h-7 px-3 text-[13px]" />
              {itemRow.action === 'PURCHASE' ? (
                <span className="text-sm font-semibold text-foreground">{formatQuantity(itemRow.recommended_purchase_quantity, unit)}</span>
              ) : null}
            </div>

            <p className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-[15px] leading-relaxed text-foreground">{itemRow.reason}</p>

            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Why</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                <StatTile label="Central stock" value={formatQuantity(d.current_stock, unit)} tone={d.current_stock === 0 ? 'danger' : undefined} />
                <StatTile label="On order" value={formatQuantity(d.on_order_qty, unit)} hint={d.open_po_count ? `${formatNumber(d.open_po_count)} open PO${d.open_po_count === 1 ? '' : 's'}` : 'no open POs'} />
                <StatTile label="Daily demand (P50)" value={`${formatDecimal(d.daily_demand_p50, 1)} ${unit ?? ''}`} hint={d.demand_std != null ? `± ${formatDecimal(d.demand_std, 1)}` : undefined} />
                <StatTile label="Supplier lead time" value={d.lead_time_days != null ? `${formatDecimal(d.lead_time_days, 1)} days` : '—'} hint={d.lead_time_std != null ? `± ${formatDecimal(d.lead_time_std, 1)} · ${formatNumber(d.lead_time_sample_size)} orders` : undefined} />
                <StatTile label="Stockout probability" value={formatPercent(d.stockout_probability)} tone={d.stockout_probability >= 0.2126 ? 'danger' : undefined} />
                <StatTile label="Reorder point" value={formatNumber(itemRow.reorder_point, { maxDigits: 0 })} hint={`safety stock ${formatNumber(itemRow.safety_stock, { maxDigits: 0 })}`} />
                <StatTile label="Order-up-to level" value={formatNumber(itemRow.order_up_to_level, { maxDigits: 0 })} />
                <StatTile label="Inventory position" value={formatNumber(itemRow.inventory_position)} hint="on hand + on order" />
              </div>
            </div>

            {itemRow.details?.purchase_order_id || itemRow.details?.supplier_name ? (
              <p className="text-xs text-muted-foreground">
                {itemRow.details.purchase_order_id ? (
                  <>
                    PO to expedite <span className="font-mono text-foreground">{itemRow.details.purchase_order_id}</span>
                    {' · '}
                  </>
                ) : null}
                Supplier{' '}
                <Link to={`/suppliers/${itemRow.details.supplier_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                  {itemRow.details.supplier_name}
                </Link>
                {' · VED '}
                {itemRow.details.ved_class}
                {' · z '}
                {formatDecimal(itemRow.details.z_value, 2)}
                {' · pack '}
                {formatNumber(itemRow.details.pack_size)}
                {itemRow.details.moq_packs != null ? ` · MOQ ${formatNumber(itemRow.details.moq_packs)} packs` : ''}
              </p>
            ) : null}
          </>
        ) : null}

        {transferRows.length > 0 ? (
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Transfers between stores</h3>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
              {transferRows.map((row) => (
                <li key={row.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:w-72">
                    <PriorityBadge priority={row.priority} />
                    <span className="text-sm font-medium">{row.store_name ?? storeName(row.store_id)}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatQuantity(row.transfer_quantity, unit)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{row.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">Advisory only – accept, adjust and reject arrive with officer login.</p>
      </div>
    )
  }

  return (
    <SectionCard
      icon={Sparkles}
      tone={tone}
      title="Recommendation"
      description={set?.model_run_id != null ? `Saved recommendation · run ${runLabel(set.model_run_id)}${set.generated_at ? ` · ${formatDateTime(set.generated_at)}` : ''}` : 'Saved recommendation from the rule engine'}
      action={
        rows.length ? (
          <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-accent">
            <Link to={`/recommendations?item_id=${encodeURIComponent(rows[0].product_id)}`}>
              All recommendations
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null
      }
    >
      {body}
    </SectionCard>
  )
}
