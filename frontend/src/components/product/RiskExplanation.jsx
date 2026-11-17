import { Info } from 'lucide-react'
import StatTile from '@/components/common/StatTile'
import { EM_DASH, formatDecimal, formatNumber, formatPercent, formatProbability } from '@/lib/format'

function hasDrivers(row) {
  return row != null && row.stock_on_hand != null && row.adu_28 != null
}

/** Whole-number quantity with unit, e.g. "40 Box"; "none" for 0. */
function qty(value, unit) {
  if (value == null) return EM_DASH
  if (Number(value) === 0) return 'none'
  return `${formatNumber(Math.round(Number(value)))}${unit ? ` ${unit}` : ''}`
}

/** One or two plain sentences that restate the saved driver values (no new numbers are computed here). */
function whyText(row, unit, horizon) {
  const rate = row.adu_28 ?? 0
  const parts = []
  if (rate > 0 && Number(row.stock_on_hand) === 0) {
    parts.push(`Nothing is on hand while about ${formatDecimal(rate, 1)} ${unit ?? 'units'} a day are used`)
  } else if (rate > 0) {
    const days = Math.round(row.days_of_cover ?? 0)
    const cover = row.days_of_cover != null ? `cover${days < 1 ? ' less than a day' : ` roughly ${formatNumber(days)} day${days === 1 ? '' : 's'}`}` : 'cover an unknown number of days'
    parts.push(`At about ${formatDecimal(rate, 1)} ${unit ?? 'units'} a day, the ${qty(row.stock_on_hand, unit)} on hand ${cover}`)
  } else {
    parts.push(`Nothing was used in the last 28 days, and ${qty(row.stock_on_hand, unit)} ${Number(row.stock_on_hand) === 1 ? 'is' : 'are'} on hand`)
  }
  const transit = row.in_transit_qty ?? 0
  const ordered = row.incoming_within_n ?? 0
  if (transit > 0 && ordered > 0) {
    parts.push(`${qty(transit, unit)} ${transit === 1 ? 'is' : 'are'} in transit to this store and ${qty(ordered, unit)} ${ordered === 1 ? 'is' : 'are'} due at the central store within ${formatNumber(horizon)} days`)
  } else if (transit > 0) {
    parts.push(`${qty(transit, unit)} ${transit === 1 ? 'is' : 'are'} in transit to this store`)
  } else if (ordered > 0) {
    parts.push(`${qty(ordered, unit)} ${ordered === 1 ? 'is' : 'are'} due at the central store within ${formatNumber(horizon)} days (nothing is in transit to this store)`)
  } else {
    parts.push(`nothing is on its way within ${formatNumber(horizon)} days`)
  }
  let text = `${parts[0]}, and ${parts[1]}.`
  if ((row.stockout_days_last_28 ?? 0) > 0) {
    text += ` This store ran out on ${formatNumber(Math.round(row.stockout_days_last_28))} of the last 28 days.`
  }
  text += Number(row.central_stock_qty) === 0 ? ' The central store has none to transfer.' : ` The central store holds ${qty(row.central_stock_qty, unit)}.`
  return text
}

/** What the band means, from the model's held-out test scores (GET /predictions/models). */
function bandText(level, details) {
  if (!details) return null
  const { thresholds, review, urgent, test_period: period } = details
  const pct = (v) => formatPercent(v, 1)
  const per100 = (v) => formatNumber(Math.round(v * 100))
  if (level === 'URGENT') {
    return `Urgent means ${pct(thresholds.urgent)} or more. In testing on ${period} data, about ${per100(urgent.precision)} in 100 store-items flagged urgent did run out within ${formatNumber(details.horizon_days)} days, and this band caught ${per100(urgent.recall)}% of the stockouts that happened.`
  }
  if (level === 'REVIEW') {
    return `Review means between ${pct(thresholds.review)} and ${pct(thresholds.urgent)}. In testing on ${period} data, about ${per100(review.precision)} in 100 store-items flagged review or higher did run out within ${formatNumber(details.horizon_days)} days; together the two bands caught ${per100(review.recall)}% of the stockouts that happened.`
  }
  return `Low means below ${pct(thresholds.review)}: the item is not flagged, because at that level stockouts were rare in testing on ${period} data.`
}

/**
 * "Why is this at risk?" for one store × item stockout prediction: what the percentage means, what the band means,
 * the saved driver values the model scored, and a plain restatement of them. Everything shown is a stored value or a
 * score from metrics.json; nothing is recalculated here.
 *
 * @param {{ row: import('@/api/shapes').StockoutRiskRow, itemName: string, unit?: string,
 *   details?: import('@/api/shapes').ModelDetails | null }} props
 */
export default function RiskExplanation({ row, itemName, unit, details }) {
  const horizon = row.horizon_days ?? details?.horizon_days ?? 14
  const drivers = hasDrivers(row)
  const coverDanger = row.days_of_cover != null && row.days_of_cover < horizon

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="space-y-2 text-sm leading-relaxed text-foreground">
        <p>
          <span className="font-semibold">{formatProbability(row.probability)}</span> is the model's estimate that{' '}
          <span className="font-medium">{row.store_name}</span> runs out of {itemName} at least once in the next {formatNumber(horizon)} days. It is not an
          accuracy score and it does not guarantee a stockout.
        </p>
        {details ? <p className="text-muted-foreground">{bandText(row.risk_level, details)}</p> : null}
      </div>

      {drivers ? (
        <>
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Why</h4>
            <p className="text-sm leading-relaxed text-foreground">{whyText(row, unit, horizon)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatTile label="On hand" value={qty(row.stock_on_hand, unit)} tone={Number(row.stock_on_hand) === 0 ? 'danger' : undefined} hint="end of prediction day" />
            <StatTile label="Average daily use" value={row.adu_28 > 0 ? `${formatDecimal(row.adu_28, 1)} ${unit ?? ''}`.trim() : 'none'} hint="last 28 days" />
            <StatTile label="Days of cover" value={row.days_of_cover != null ? `${formatNumber(Math.round(row.days_of_cover))} days` : 'no recent use'} tone={coverDanger ? 'danger' : undefined} hint={`model looks ${formatNumber(horizon)} days ahead`} />
            <StatTile label="In transit to this store" value={qty(row.in_transit_qty, unit)} hint="transfers on the way" />
            <StatTile label={`Due at central, ${formatNumber(horizon)} days`} value={qty(row.incoming_within_n, unit)} hint="open purchase orders" />
            <StatTile label={`Expected use, ${formatNumber(horizon)} days`} value={qty(row.fc_next_n_p50, unit)} hint="demand forecast" />
            <StatTile label="Ran out, last 28 days" value={row.stockout_days_last_28 > 0 ? `${formatNumber(Math.round(row.stockout_days_last_28))} day${Math.round(row.stockout_days_last_28) === 1 ? '' : 's'}` : 'never'} tone={row.stockout_days_last_28 > 0 ? 'danger' : undefined} hint={row.days_since_stockout != null ? `last time ${formatNumber(Math.round(row.days_since_stockout))} days ago` : undefined} />
            <StatTile label="Central store stock" value={qty(row.central_stock_qty, unit)} tone={Number(row.central_stock_qty) === 0 ? 'danger' : undefined} hint="available to transfer" />
            <StatTile label="Supplier lead time" value={row.supplier_lt_mean != null ? `${formatDecimal(row.supplier_lt_mean, 1)} days` : EM_DASH} hint="preferred supplier, average" />
          </div>
        </>
      ) : (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          The reasons behind this estimate are saved with newer prediction runs. Run a prediction refresh to see them.
        </p>
      )}
    </div>
  )
}
