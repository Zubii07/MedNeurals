import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import StatTile from '@/components/common/StatTile'
import { ActionBadge, PriorityBadge } from '@/components/common/ToneBadge'
import { ACTIONS, PRIORITIES } from '@/lib/enums'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

/** Known enum values first (in their canonical order), anything unexpected after them. */
function orderedEntries(counts, order) {
  const source = counts ?? {}
  const known = order.filter((key) => key in source).map((key) => [key, source[key]])
  const unknown = Object.entries(source).filter(([key]) => !order.includes(key))
  return [...known, ...unknown]
}

function CountRow({ label, entries, renderBadge }) {
  if (!entries.length) return null
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
        {entries.map(([key, count]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            {renderBadge(key)}
            <span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(count)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * One generated recommendation set (RecommendationSummary, §6.9): row/item counts, counts per action and
 * priority, the skipped items and the runs it belongs to. Display only – nothing is computed here.
 * @param {{ summary: import('@/api/shapes').RecommendationSummary }} props
 */
export default function RecommendationSummaryPanel({ summary }) {
  const [showSkipped, setShowSkipped] = useState(false)
  const skipped = Array.isArray(summary.skipped) ? summary.skipped : null
  const skippedCount = summary.skipped_count ?? 0

  return (
    <div className="space-y-4">
      {summary.created === false ? (
        <p className="text-xs text-muted-foreground">These predictions already had recommendations; nothing new was written.</p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Recommendations" value={formatNumber(summary.row_count)} />
        <StatTile label="Products covered" value={formatNumber(summary.item_count)} />
        <StatTile label="Products skipped" value={formatNumber(skippedCount)} hint="missing supplier or stock data" tone={skippedCount > 0 ? 'danger' : undefined} />
      </div>

      <CountRow label="By action" entries={orderedEntries(summary.action_counts, ACTIONS)} renderBadge={(key) => <ActionBadge action={key} />} />
      <CountRow label="By priority" entries={orderedEntries(summary.priority_counts, PRIORITIES)} renderBadge={(key) => <PriorityBadge priority={key} />} />

      {skippedCount > 0 ? (
        skipped ? (
          <div>
            <Button type="button" variant="ghost" size="sm" className="-ml-2" aria-expanded={showSkipped} onClick={() => setShowSkipped((open) => !open)}>
              {showSkipped ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              {showSkipped ? 'Hide skipped items' : `Show skipped items (${formatNumber(skipped.length)})`}
            </Button>
            {showSkipped ? (
              <ul className="mt-2 max-h-56 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70 text-xs">
                {skipped.map(({ item_id, reason }) => (
                  <li key={item_id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
                    <Link to={`/products/${encodeURIComponent(item_id)}`} className="shrink-0 font-mono font-medium text-primary hover:underline">
                      {item_id}
                    </Link>
                    <span className="text-muted-foreground">{reason}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">The list of skipped products is only available right after generation.</p>
        )
      ) : null}

      <p className="text-xs text-muted-foreground">
        Predictions from {formatDate(summary.prediction_date)}, using data through {formatDate(summary.data_cutoff_date)}
        {summary.generated_at ? ` · generated ${formatDateTime(summary.generated_at)}` : ''}
      </p>
    </div>
  )
}
