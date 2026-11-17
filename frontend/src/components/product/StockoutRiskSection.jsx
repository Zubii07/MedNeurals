import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import EmptyState from '@/components/common/EmptyState'
import { RiskBadge } from '@/components/common/ToneBadge'
import RiskExplanation from './RiskExplanation'
import SectionCard from './SectionCard'
import { useModelDetails } from '@/api/hooks'
import { formatNumber, formatProbability } from '@/lib/format'
import { RISK_LEVEL_META, TONE_COLORS, enumMeta, storeShortName } from '@/lib/enums'
import { cn } from '@/lib/utils'

/**
 * "Could we run out?" (plan §7.6 item 3): stockout risk per sub-store as a bar list, highest first, and under it the
 * explanation for the selected store (the highest by default): what the percentage means and the saved values
 * behind it. Click a store to explain that one instead.
 * @param {{ stockoutRisk: import('@/api/shapes').ProductAnalysis['stockout_risk'], itemId: string, itemName: string, unit?: string }} props
 */
export default function StockoutRiskSection({ stockoutRisk, itemId, itemName, unit }) {
  const rows = [...(stockoutRisk?.by_store ?? [])].sort((a, b) => b.probability - a.probability)
  const highest = stockoutRisk?.highest ?? null
  const [selectedStore, setSelectedStore] = useState(null)
  const selected = rows.find((row) => row.store_id === selectedStore) ?? rows.find((row) => row.store_id === highest?.store_id) ?? rows[0] ?? null
  const details = useModelDetails({ enabled: rows.length > 0 })
  const tone = highest ? enumMeta(RISK_LEVEL_META, highest.risk_level).tone : 'primary'
  const horizon = selected?.horizon_days ?? 14

  let body
  if (!stockoutRisk) {
    body = <EmptyState icon={ShieldAlert} title="No predictions yet." compact />
  } else if (rows.length === 0) {
    body = <EmptyState icon={ShieldAlert} title="No stockout prediction for this item in the latest run." compact />
  } else {
    body = (
      <div className="space-y-4">
        <ol className="space-y-1.5">
          {rows.map((row) => {
            const isHighest = highest && row.store_id === highest.store_id
            const isSelected = selected && row.store_id === selected.store_id
            const meta = enumMeta(RISK_LEVEL_META, row.risk_level)
            const pct = Math.max(0, Math.min(100, row.probability * 100))
            return (
              <li key={row.store_id}>
                <button
                  type="button"
                  onClick={() => setSelectedStore(row.store_id)}
                  aria-pressed={isSelected}
                  className={cn(
                    'w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                    isSelected && 'bg-muted/70 ring-1 ring-border',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground" title={row.store_name}>
                        {row.store_name ?? storeShortName(row.store_id)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {row.store_id}
                        {isHighest ? ' · highest' : ''}
                        {isSelected ? ' · explained below' : ''}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="w-12 text-right text-sm font-semibold tabular-nums">{formatProbability(row.probability)}</span>
                      <RiskBadge level={row.risk_level} className="w-[5.25rem] justify-center" />
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${formatProbability(row.probability)} ${meta.label}`}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: TONE_COLORS[meta.tone] }} />
                  </div>
                </button>
              </li>
            )
          })}
        </ol>

        {selected ? <RiskExplanation row={selected} itemName={itemName} unit={unit} details={details.data?.stockout ?? null} /> : null}
      </div>
    )
  }

  return (
    <SectionCard
      icon={ShieldAlert}
      tone={tone}
      title="Could we run out?"
      description={`How likely each store is to run out of this item within the next ${formatNumber(horizon)} days`}
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
