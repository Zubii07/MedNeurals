import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import ToneBadge, { ActionBadge, PriorityBadge, RiskBadge } from '@/components/common/ToneBadge'
import AiSummary from './AiSummary'
import { RECOMMENDATION_STATUS_META, enumMeta } from '@/lib/enums'
import { formatDateTime, formatNumber, formatProbability, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'

const ACCENT = {
  URGENT: 'border-danger/40 before:bg-danger',
  REVIEW: 'border-warning/50 before:bg-warning',
  LOW: 'border-success/40 before:bg-success',
  none: 'before:bg-border',
}

const HEADLINE = {
  URGENT: (store) => `High risk of running out at ${store}`,
  REVIEW: (store) => `Moderate risk of running out at ${store}`,
  LOW: () => 'Low risk of running out in the next two weeks',
}

/** The one line that says what to do, from the saved recommendation rows. */
function actionLine(itemRow, transfers, unit) {
  if (!itemRow && transfers.length === 0) return null
  if (!itemRow) return { badgeAction: 'TRANSFER', priority: transfers[0].priority, text: `Move stock from the central store to ${formatNumber(transfers.length)} sub-store${transfers.length === 1 ? '' : 's'}` }
  const d = itemRow.details ?? {}
  if (itemRow.action === 'PURCHASE') return { badgeAction: itemRow.action, priority: itemRow.priority, text: `Order ${formatQuantity(itemRow.recommended_purchase_quantity, unit)}${d.supplier_name ? ` from ${d.supplier_name}` : ''}` }
  if (itemRow.action === 'EXPEDITE_PO') return { badgeAction: itemRow.action, priority: itemRow.priority, text: `Ask ${d.supplier_name ?? 'the supplier'} to deliver purchase order ${d.purchase_order_id ?? ''} sooner`.trim() }
  if (itemRow.action === 'NONE') return { badgeAction: itemRow.action, priority: itemRow.priority, text: 'Stock position is adequate; no purchase needed now' }
  return { badgeAction: itemRow.action, priority: itemRow.priority, text: itemRow.reason }
}

/**
 * Section 2 – the warning and the recommended action, the most prominent block on the page: risk level and store,
 * the short explanation (the LLM paragraph, or the rule engine's reason while it loads), and what to do now.
 * Every value is a stored result; the percentage is shown as an estimate.
 * @param {{ analysis: import('@/api/shapes').ProductAnalysis }} props
 */
export default function MainWarningCard({ analysis }) {
  const unit = analysis.item?.uom
  const run = analysis.prediction_run
  const highest = analysis.stockout_risk?.highest ?? null
  const level = highest?.risk_level ?? 'none'
  const horizon = highest?.horizon_days ?? 14
  const rec = analysis.recommendation
  const rows = rec?.rows ?? []
  const itemRow = rows.find((row) => row.action !== 'TRANSFER') ?? null
  const transfers = rows.filter((row) => row.action === 'TRANSFER')
  const transferTotal = transfers.reduce((sum, row) => sum + (row.transfer_quantity ?? 0), 0)
  const action = actionLine(itemRow, transfers, unit)
  const recMissing = rec?.item_status === 'set_missing' || rec?.recommendation_set?.status === 'missing'

  if (!run) {
    return (
      <Card className="relative overflow-hidden border-dashed px-6 py-6 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-border">
        <p className="text-base font-semibold text-foreground">No predictions yet for this product.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Import data and run a prediction refresh to see its stockout risk and the recommended action.{' '}
          <Link to="/data" className="font-medium text-primary hover:underline">
            Go to Data & Predictions →
          </Link>
        </p>
      </Card>
    )
  }

  const headline = highest ? HEADLINE[level]?.(highest.store_name) ?? `Stockout risk at ${highest.store_name}` : 'No stockout estimate for this product in the latest predictions'

  return (
    <Card className={cn('relative gap-5 overflow-hidden px-6 py-6 before:absolute before:inset-y-0 before:left-0 before:w-1.5', ACCENT[level] ?? ACCENT.none)}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {highest ? <RiskBadge level={highest.risk_level} className="h-7 px-3 text-[13px]" /> : null}
          <h2 className="text-xl leading-snug font-semibold text-foreground">{headline}</h2>
        </div>
        {highest ? (
          <p className="text-sm text-muted-foreground">
            Estimated <span className="font-semibold text-foreground">{formatProbability(highest.probability)}</span> chance of running out there within the next{' '}
            {formatNumber(horizon)} days, based on current stock, recent use and deliveries. This is an estimate, not a certainty.
            {level === 'LOW' ? ` ${highest.store_name} is the store with the highest chance.` : ''}
          </p>
        ) : null}
      </div>

      <AiSummary
        itemId={analysis.item.item_id}
        enabled={Boolean(run)}
        fallback={itemRow?.reason ? <p className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-[15px] leading-relaxed text-foreground">{itemRow.reason}</p> : null}
      />

      <div className="rounded-xl border border-border/70 bg-card px-4 py-3.5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What to do now</p>
        {action ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ActionBadge action={action.badgeAction} className="h-7 px-3 text-[13px]" />
              <PriorityBadge priority={action.priority} className="h-7 px-3 text-[13px]" />
            </div>
            <p className="mt-2 text-base font-medium text-foreground">{action.text}</p>
            {transfers.length > 0 && itemRow ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Plus {formatNumber(transfers.length)} transfer{transfers.length === 1 ? '' : 's'} between stores, {formatQuantity(transferTotal, unit)} in total. Details below.
              </p>
            ) : null}
            {itemRow?.decision ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <ToneBadge label={enumMeta(RECOMMENDATION_STATUS_META, itemRow.status).label} tone={enumMeta(RECOMMENDATION_STATUS_META, itemRow.status).tone} icon={null} />
                <span>
                  by {itemRow.decision.decided_by_name} on {formatDateTime(itemRow.decision.decided_at)}
                  {itemRow.decision.adjusted_quantity != null ? `; decided ${formatQuantity(itemRow.decision.adjusted_quantity, unit)}` : ''}
                  {itemRow.decision.reason ? ` – “${itemRow.decision.reason}”` : ''}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">Advisory only. A procurement officer decides on the Recommendations page.</p>
            )}
          </>
        ) : recMissing ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Recommendations for the latest predictions have not been generated.{' '}
            <Link to="/data" className="font-medium text-primary hover:underline">
              Generate them →
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No recommendation for this product in the latest set.</p>
        )}
      </div>
    </Card>
  )
}
