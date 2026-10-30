import { BarChart3 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import WidgetCard from '@/components/common/WidgetCard'
import RiskByStoreChart from '@/components/charts/RiskByStoreChart'
import { formatDate, formatNumber } from '@/lib/format'

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
        Urgent
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-warning" />
        Review
      </span>
    </div>
  )
}

/**
 * "At-risk items by sub-store" widget (plan §4): URGENT + REVIEW store×item rows grouped by store.
 *
 * @param {{ urgentQuery: import('@tanstack/react-query').UseQueryResult<import('@/api/shapes').StockoutRiskPage>,
 *   reviewQuery: import('@tanstack/react-query').UseQueryResult<import('@/api/shapes').StockoutRiskPage>,
 *   predictionDate: string | null | undefined, hasRun: boolean }} props
 */
export default function RiskByStoreCard({ urgentQuery, reviewQuery, predictionDate, hasRun }) {
  const notFound = (query) => query.isError && query.error?.status === 404
  const pending = urgentQuery.isPending || reviewQuery.isPending
  const failed = (urgentQuery.isError && !notFound(urgentQuery)) || (reviewQuery.isError && !notFound(reviewQuery))
  const urgentRows = urgentQuery.data?.items ?? []
  const reviewRows = reviewQuery.data?.items ?? []
  // The endpoint caps `limit` at 1000; say so if a level has more rows than that.
  const capped = [urgentQuery.data, reviewQuery.data].some((page) => page && page.total > page.items.length)

  let body
  if (!hasRun || notFound(urgentQuery) || notFound(reviewQuery)) {
    body = <EmptyState icon={BarChart3} title="No stockout predictions yet." compact />
  } else if (pending) {
    body = <Skeleton className="h-[200px] w-full" />
  } else if (failed) {
    const query = urgentQuery.isError ? urgentQuery : reviewQuery
    body = <ErrorState error={query.error} onRetry={() => { urgentQuery.refetch(); reviewQuery.refetch() }} retrying={query.isFetching} compact />
  } else if (urgentRows.length + reviewRows.length === 0) {
    body = <EmptyState icon={BarChart3} title="No URGENT or REVIEW rows in the latest run." compact />
  } else {
    body = (
      <>
        <RiskByStoreChart urgentRows={urgentRows} reviewRows={reviewRows} />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <Legend />
          <p className="text-[11px] text-muted-foreground">
            {formatNumber(urgentQuery.data?.total)} urgent · {formatNumber(reviewQuery.data?.total)} review store × item rows
            {capped ? ' (chart shows the first 1,000 per level)' : ''}
          </p>
        </div>
      </>
    )
  }

  return (
    <WidgetCard
      title="At-risk items by sub-store"
      description={hasRun && predictionDate ? `Next 14 days · from prediction date ${formatDate(predictionDate)}` : 'Next 14 days'}
    >
      {body}
    </WidgetCard>
  )
}
