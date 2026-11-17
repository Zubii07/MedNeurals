import { Link, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/common/ErrorState'
import NotFoundCard from '@/components/common/NotFoundCard'
import ProductHeader from '@/components/product/ProductHeader'
import SummaryStrip from '@/components/product/SummaryStrip'
import RecommendationSection from '@/components/product/RecommendationSection'
import StockoutRiskSection from '@/components/product/StockoutRiskSection'
import ForecastSection from '@/components/product/ForecastSection'
import LiveContextSection from '@/components/product/LiveContextSection'
import { useProductAnalysis } from '@/api/hooks'
import { formatDate } from '@/lib/format'

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  )
}

/** Footer: when the predictions on this page were made (plain words; model details live on Data & Predictions). */
function RunFooter({ run }) {
  if (!run) {
    return (
      <p className="text-xs text-muted-foreground">
        No predictions yet.{' '}
        <Link to="/data" className="font-medium text-primary hover:underline">
          Run a prediction refresh →
        </Link>
      </p>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">
      Predictions made on <span className="font-medium text-foreground">{formatDate(run.prediction_date)}</span> from data up to{' '}
      <span className="font-medium text-foreground">{formatDate(run.data_cutoff_date)}</span>.
    </p>
  )
}

/**
 * Product Analysis (`/products/:itemId`, plan §7.6) – one read-only decision view built from GET /products/{id}/analysis:
 * stock, next delivery, stockout risk and recommended action on top, then what to do, could we run out, and how much
 * we will need.
 */
export default function ProductAnalysisPage() {
  const { itemId } = useParams()
  const { data, isPending, isError, error, refetch, isFetching } = useProductAnalysis(itemId)

  if (isPending) return <PageSkeleton />
  if (isError && error?.status === 404) return <NotFoundCard title="Product not found" noun="item" id={itemId} to="/products" linkLabel="Back to Products" />
  if (isError) {
    return (
      <Card>
        <ErrorState error={error} onRetry={refetch} retrying={isFetching} />
      </Card>
    )
  }

  const unit = data.item?.uom

  return (
    <div className="space-y-6">
      <ProductHeader item={data.item} />
      <SummaryStrip analysis={data} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <RecommendationSection recommendation={data.recommendation} unit={unit} itemId={data.item.item_id} />
          <StockoutRiskSection stockoutRisk={data.stockout_risk} itemId={data.item.item_id} itemName={data.item.item_name} unit={unit} />
          <ForecastSection forecast={data.forecast} unit={unit} itemId={data.item.item_id} predictionDate={data.prediction_run?.prediction_date ?? null} />
        </div>
        <div className="min-w-0">
          <LiveContextSection analysis={data} />
        </div>
      </div>

      <RunFooter run={data.prediction_run} />
    </div>
  )
}
