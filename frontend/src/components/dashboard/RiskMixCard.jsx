import { PieChart } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/common/EmptyState'
import WidgetCard from '@/components/common/WidgetCard'
import RiskMixDonut from '@/components/charts/RiskMixDonut'
import { errorMessage } from '@/api/client'
import { formatNumber } from '@/lib/format'

/**
 * "Stockout risk mix" widget (plan §4): donut of URGENT / REVIEW / LOW item counts from the summary,
 * plus "Out of stock now" from GET /inventory?latest=true&stockout_only=true&limit=1 (`total`).
 *
 * @param {{ summary: import('@/api/shapes').DashboardSummary | undefined, loading: boolean,
 *   stockoutQuery: import('@tanstack/react-query').UseQueryResult<import('@/api/shapes').Page<import('@/api/shapes').InventoryRow>> }} props
 */
export default function RiskMixCard({ summary, loading, stockoutQuery }) {
  const counts = summary?.stockout_risk_counts ?? null
  const hasRun = Boolean(summary?.prediction_run)

  let body
  if (loading) {
    body = (
      <div className="flex items-center gap-6">
        <Skeleton className="size-[150px] rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  } else if (!hasRun || !counts) {
    body = <EmptyState icon={PieChart} title="No stockout predictions yet." compact />
  } else {
    body = <RiskMixDonut counts={counts} />
  }

  let outOfStock
  if (stockoutQuery.isPending) {
    outOfStock = <Skeleton className="inline-block h-4 w-10 align-middle" />
  } else if (stockoutQuery.isError) {
    outOfStock = <span className="text-danger" title={errorMessage(stockoutQuery.error)}>unavailable</span>
  } else {
    outOfStock = <span className="font-semibold text-foreground">{formatNumber(stockoutQuery.data?.total)} store × item</span>
  }

  return (
    <WidgetCard
      title="Stockout risk mix"
      description={
        summary?.items_without_stockout_prediction
          ? `Items at their worst sub-store · ${formatNumber(summary.items_without_stockout_prediction)} items without a prediction`
          : 'Items at their worst sub-store, next 14 days'
      }
    >
      {body}
      <div className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
        Out of stock now: {outOfStock}
        {stockoutQuery.data?.items?.[0]?.date ? <span className="text-muted-foreground/80"> · as of {stockoutQuery.data.items[0].date}</span> : null}
      </div>
    </WidgetCard>
  )
}
