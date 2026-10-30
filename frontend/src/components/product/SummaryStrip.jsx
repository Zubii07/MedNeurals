import { Boxes, ShieldAlert, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PriorityBadge, RiskBadge } from '@/components/common/ToneBadge'
import { ACTION_META, PRIORITY_META, RISK_LEVEL_META, enumMeta } from '@/lib/enums'
import { formatDate, formatNumber, formatPercent, formatQuantity } from '@/lib/format'
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

/**
 * At-a-glance verdict for the item: recommended action, highest stockout risk and stock position.
 * Every value is a persisted field from GET /products/{id}/analysis.
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
  const onOrder = analysis.open_purchase_orders?.quantity ?? null

  const recTone = itemRow ? enumMeta(PRIORITY_META, itemRow.priority).tone : 'neutral'
  const riskTone = highest ? enumMeta(RISK_LEVEL_META, highest.risk_level).tone : 'neutral'
  const stockTone = stock ? (stock.total_qty === 0 ? 'danger' : stock.central_store_qty === 0 ? 'warning' : 'success') : 'neutral'

  let quantityLine = null
  if (itemRow?.action === 'PURCHASE') quantityLine = `Order ${formatQuantity(itemRow.recommended_purchase_quantity, unit)}`
  else if (itemRow?.action === 'TRANSFER') quantityLine = `Move ${formatQuantity(itemRow.transfer_quantity, unit)}`
  else if (itemRow?.action === 'EXPEDITE_PO' && itemRow.details?.purchase_order_id) quantityLine = `Chase ${itemRow.details.purchase_order_id}`
  else if (itemRow?.action === 'NONE') quantityLine = 'Stock position is adequate'

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SummaryCard icon={Sparkles} tone={recTone} label="Recommended action" footer={transfers ? `+ ${transfers} transfer${transfers === 1 ? '' : 's'} between stores` : rec?.recommendation_set?.model_run_id ? `Rule engine · run #${rec.recommendation_set.model_run_id}` : undefined}>
        {!rec ? (
          <p className="text-sm text-muted-foreground">No prediction run yet.</p>
        ) : rec.item_status !== 'available' || !itemRow ? (
          <p className="text-sm text-muted-foreground">{rec.item_status === 'set_missing' ? 'Recommendation set missing.' : 'Not included in the latest set.'}</p>
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

      <SummaryCard
        icon={ShieldAlert}
        tone={riskTone}
        label="Highest stockout risk"
        footer={riskRows.length ? `${formatNumber(riskRows.length)} stores predicted · ${formatNumber(urgentStores)} urgent · next ${highest?.horizon_days ?? 14} days` : undefined}
      >
        {!analysis.stockout_risk ? (
          <p className="text-sm text-muted-foreground">No prediction run yet.</p>
        ) : !highest ? (
          <p className="text-sm text-muted-foreground">No stockout prediction for this item.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('text-xl font-semibold tabular-nums', riskTone === 'danger' ? 'text-danger' : 'text-foreground')}>{formatPercent(highest.probability)}</span>
              <RiskBadge level={highest.risk_level} />
            </div>
            <p className="mt-1 truncate text-sm font-medium text-foreground" title={highest.store_name}>
              {highest.store_name}
            </p>
          </>
        )}
      </SummaryCard>

      <SummaryCard icon={Boxes} tone={stockTone} label="Stock position" footer={stock ? `As of ${formatDate(stock.as_of_date)} · live inventory` : undefined}>
        {!stock ? (
          <p className="text-sm text-muted-foreground">No inventory rows for this item.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tabular-nums text-foreground">{formatQuantity(stock.total_qty, unit)}</span>
              <span className="text-xs text-muted-foreground">on hand, all stores</span>
            </div>
            <p className="mt-1 text-sm text-foreground">
              Central <span className={cn('font-semibold tabular-nums', stock.central_store_qty === 0 && 'text-danger')}>{formatNumber(stock.central_store_qty)}</span>
              {onOrder != null ? (
                <>
                  <span className="text-muted-foreground"> · </span>
                  On order <span className="font-semibold tabular-nums">{formatNumber(onOrder)}</span>
                </>
              ) : null}
            </p>
          </>
        )}
      </SummaryCard>
    </div>
  )
}
