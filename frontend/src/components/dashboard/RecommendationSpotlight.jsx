import { Link } from 'react-router-dom'
import { ArrowRight, Boxes, Clock, Percent, Sparkles, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/api/client'
import { ACTION_META, enumMeta } from '@/lib/enums'
import { formatDecimal, formatPercent, formatQuantity } from '@/lib/format'

/**
 * Dark teal "Recommendation spotlight" (replaces the design's AI Insights card, plan §4):
 * the highest-ranked saved recommendation with its reason and four facts from `details`.
 *
 * @param {{ query: import('@tanstack/react-query').UseQueryResult<import('@/api/shapes').RecommendationPage>, setStatus: 'current' | 'missing' | null, hasRun: boolean }} props
 */
export default function RecommendationSpotlight({ query, setStatus, hasRun }) {
  const { data, isPending, isError, error } = query
  const row = data?.items?.[0]

  let content
  if (!hasRun || setStatus === 'missing' || (isError && error?.status === 404)) {
    content = (
      <>
        <p className="text-[15px] font-semibold leading-snug">
          {setStatus === 'missing' ? 'Recommendations for the latest run are missing.' : 'No recommendations yet.'}
        </p>
        <p className="text-sm text-white/75">Import data and run a prediction refresh to generate advice for every item.</p>
        <Button asChild className="mt-1 h-10 w-fit rounded-xl bg-mint px-4 text-[#0b3442] hover:bg-mint-light">
          <Link to="/data">
            Go to Data & Predictions
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </>
    )
  } else if (isPending) {
    content = (
      <>
        <Skeleton className="h-5 w-3/4 bg-white/15" />
        <Skeleton className="h-4 w-full bg-white/15" />
        <Skeleton className="h-4 w-5/6 bg-white/15" />
        <Skeleton className="mt-1 h-10 w-40 bg-white/15" />
        <Skeleton className="mt-2 h-28 w-full bg-white/10" />
      </>
    )
  } else if (isError) {
    content = <p className="text-sm text-white/80">{errorMessage(error)}</p>
  } else if (!row) {
    content = <p className="text-sm text-white/80">The current recommendation set has no rows.</p>
  } else {
    const action = enumMeta(ACTION_META, row.action).label
    const details = row.details ?? {}
    const facts = [
      { icon: Boxes, label: 'Current stock', value: formatQuantity(details.current_stock, row.unit) },
      { icon: TrendingUp, label: 'Forecast daily demand', value: `${formatDecimal(details.daily_demand_p50, 1)} ${row.unit ?? ''}`.trim() },
      { icon: Clock, label: 'Supplier lead time', value: details.lead_time_days != null ? `${formatDecimal(details.lead_time_days, 1)} days` : '—' },
      { icon: Percent, label: 'Stockout probability', value: formatPercent(details.stockout_probability) },
    ]
    content = (
      <>
        <p className="text-[15px] font-semibold leading-snug">
          {row.product_name} · {action}
        </p>
        <p className="text-sm leading-relaxed text-white/80">{row.reason}</p>
        <Button asChild className="mt-1 h-10 w-fit rounded-xl bg-mint px-4 font-semibold text-[#0b3442] hover:bg-mint-light">
          <Link to={`/products/${row.product_id}`}>
            View analysis
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <div className="mt-2 rounded-xl bg-white/[0.07] p-4 ring-1 ring-white/10">
          <p className="text-sm font-semibold">Why this recommendation?</p>
          <ul className="mt-3 space-y-2.5">
            {facts.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm">
                <Icon className="size-4 shrink-0 text-mint" aria-hidden="true" />
                <span className="text-white/75">{label}:</span>
                <span className="ml-auto font-medium tabular-nums">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  return (
    <Card className="gap-4 border-0 bg-[linear-gradient(160deg,var(--teal-card-from)_0%,var(--teal-card-to)_100%)] px-5 py-5 text-white shadow-[0_18px_40px_-24px_rgb(11_85_96/0.8)] [--card-spacing:0]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-mint ring-1 ring-white/10">
            <Sparkles className="size-[18px]" aria-hidden="true" />
          </span>
          <h3 className="text-base font-semibold">Recommendation spotlight</h3>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white/85 ring-1 ring-white/10">
          ML risk + rule engine
        </span>
      </div>
      <div className="flex flex-col gap-3">{content}</div>
    </Card>
  )
}
