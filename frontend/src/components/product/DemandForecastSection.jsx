import { useMemo } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import DemandHistoryChart from '@/components/charts/DemandHistoryChart'
import { useWeeklyDemand } from '@/api/hooks'
import { formatDecimal } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Weeks of recorded demand shown before the four forecast weeks. */
const HISTORY_WEEKS = 12

const TREND = {
  increasing: { label: 'Increasing', icon: ArrowUpRight, className: 'bg-info-bg text-[#1d4ed8]' },
  decreasing: { label: 'Decreasing', icon: ArrowDownRight, className: 'bg-muted text-foreground' },
  stable: { label: 'Stable', icon: Minus, className: 'bg-muted text-foreground' },
  mixed: { label: 'Varies', icon: Minus, className: 'bg-muted text-foreground' },
}

const SENTENCE = {
  stable: () => 'Expected demand stays about the same over the next four weeks.',
  mixed: () => 'Expected demand varies from week to week over the next four weeks.',
  increasing: (change) => `Expected demand rises by about ${formatDecimal(change, 1)}% from the first to the fourth week.`,
  decreasing: (change) => `Expected demand falls by about ${formatDecimal(change, 1)}% from the first to the fourth week.`,
}

function TrendPill({ trend }) {
  if (!trend) return null
  const meta = TREND[trend.direction] ?? TREND.stable
  const Icon = meta.icon
  const sentence = (SENTENCE[trend.direction] ?? SENTENCE.stable)(Math.abs(trend.change_percent))
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', meta.className)}>
        <Icon className="size-3.5" aria-hidden="true" />
        {meta.label}
      </span>
      <span className="text-muted-foreground">{sentence}</span>
    </p>
  )
}

/**
 * Section 3 – one chart: the last 12 recorded weeks of demand (GET /demand/weekly) and the next four forecast weeks
 * (the item's saved totals), with the trend from the backend above it. Weekly values are read off the chart's tooltip.
 * @param {{ forecast: import('@/api/shapes').ProductAnalysis['forecast'], unit?: string, itemId: string, predictionDate?: string | null }} props
 */
export default function DemandForecastSection({ forecast, unit, itemId, predictionDate }) {
  const totals = useMemo(() => [...(forecast?.totals ?? [])].sort((a, b) => a.horizon - b.horizon), [forecast])
  const forecastRows = useMemo(() => totals.map((t) => ({ target_week: t.target_week, p50: t.p50 })), [totals])
  const history = useWeeklyDemand({ item_id: itemId, weeks: HISTORY_WEEKS, end_date: predictionDate ?? undefined }, { enabled: Boolean(itemId && predictionDate) })

  let body
  if (!forecast) {
    body = <EmptyState icon={ArrowRight} title="No predictions yet." compact />
  } else if (totals.length === 0) {
    body = <EmptyState icon={ArrowRight} title="No demand forecast for this product in the latest predictions." compact />
  } else {
    let chart
    if (history.isPending) chart = <Skeleton className="h-[260px] w-full" />
    else if (history.isError) chart = <ErrorState error={history.error} onRetry={history.refetch} retrying={history.isFetching} compact />
    else chart = <DemandHistoryChart history={history.data?.weeks ?? []} forecast={forecastRows} unit={unit} />

    body = (
      <div className="space-y-4">
        <TrendPill trend={forecast.trend} />
        {chart}
      </div>
    )
  }

  return (
    <section aria-labelledby="forecast-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="forecast-heading" className="text-base font-semibold text-foreground">
            Demand forecast
          </h2>
          <p className="text-xs text-muted-foreground">Weekly demand{unit ? ` in ${unit}` : ''}, all stores together: the last {HISTORY_WEEKS} weeks and the next four.</p>
        </div>
        <Link to={`/forecasts?item_id=${encodeURIComponent(itemId)}`} className="text-sm font-medium text-primary hover:underline">
          Forecast per store →
        </Link>
      </div>
      <Card className="px-5 py-5 [--card-spacing:0]">{body}</Card>
    </section>
  )
}
