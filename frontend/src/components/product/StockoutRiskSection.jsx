import { Link } from 'react-router-dom'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EmptyState from '@/components/common/EmptyState'
import { RiskBadge } from '@/components/common/ToneBadge'
import SectionCard from './SectionCard'
import { formatPercent } from '@/lib/format'
import { RISK_LEVEL_META, TONE_COLORS, enumMeta, storeShortName } from '@/lib/enums'
import { cn } from '@/lib/utils'

/**
 * Stockout risk per sub-store as a bar list, highest first; the `highest` row is marked (plan §7.6 item 3).
 * @param {{ stockoutRisk: import('@/api/shapes').ProductAnalysis['stockout_risk'], itemId: string }} props
 */
export default function StockoutRiskSection({ stockoutRisk, itemId }) {
  const rows = [...(stockoutRisk?.by_store ?? [])].sort((a, b) => b.probability - a.probability)
  const highest = stockoutRisk?.highest ?? null
  const sample = rows[0] ?? highest
  const tone = highest ? enumMeta(RISK_LEVEL_META, highest.risk_level).tone : 'primary'

  let body
  if (!stockoutRisk) {
    body = <EmptyState icon={ShieldAlert} title="No prediction run yet." compact />
  } else if (rows.length === 0) {
    body = <EmptyState icon={ShieldAlert} title="No stockout prediction for this item in the latest run." compact />
  } else {
    body = (
      <ol className="space-y-2.5">
        {rows.map((row) => {
          const isHighest = highest && row.store_id === highest.store_id
          const meta = enumMeta(RISK_LEVEL_META, row.risk_level)
          const pct = Math.max(0, Math.min(100, row.probability * 100))
          return (
            <li key={row.store_id} className={cn('rounded-xl px-3 py-2', isHighest && 'bg-danger-bg/40 ring-1 ring-danger/15')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground" title={row.store_name}>
                    {row.store_name ?? storeShortName(row.store_id)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {row.store_id}
                    {isHighest ? ' · highest' : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="w-14 text-right text-sm font-semibold tabular-nums">{formatPercent(row.probability)}</span>
                  <RiskBadge level={row.risk_level} className="w-[5.25rem] justify-center" />
                </div>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${formatPercent(row.probability)} ${meta.label}`}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: TONE_COLORS[meta.tone] }} />
              </div>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <SectionCard
      icon={ShieldAlert}
      tone={tone}
      title="Stockout risk by store"
      description={sample ? `Chance of running out within ${sample.horizon_days} days · Review from ${formatPercent(sample.threshold_review)}, Urgent from ${formatPercent(sample.threshold_urgent)}` : 'Chance of running out within 14 days, per sub-store'}
      action={
        <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-accent">
          <Link to={`/stockout-risks?item_id=${encodeURIComponent(itemId)}`}>
            Risk centre
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {body}
    </SectionCard>
  )
}
