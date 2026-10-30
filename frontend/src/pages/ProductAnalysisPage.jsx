import { Link, useParams } from 'react-router-dom'
import { Activity, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/common/ErrorState'
import ProductHeader from '@/components/product/ProductHeader'
import SummaryStrip from '@/components/product/SummaryStrip'
import RecommendationSection from '@/components/product/RecommendationSection'
import StockoutRiskSection from '@/components/product/StockoutRiskSection'
import ForecastSection from '@/components/product/ForecastSection'
import LiveContextSection from '@/components/product/LiveContextSection'
import { useProductAnalysis } from '@/api/hooks'
import { formatDate, formatDateTime, runLabel } from '@/lib/format'

function NotFoundCard({ itemId }) {
  return (
    <div className="mx-auto max-w-lg pt-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-danger-bg text-danger">
            <SearchX className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">Product not found</h1>
          <p className="text-sm text-muted-foreground">
            There is no item with id <span className="font-mono break-all text-foreground">{itemId}</span>.
          </p>
          <Button asChild className="mt-2 rounded-lg">
            <Link to="/products">Back to Products</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
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

/** Footer: the prediction run the saved sections come from (plan §7.6 item 6). */
function RunFooter({ run }) {
  if (!run) {
    return (
      <p className="text-xs text-muted-foreground">
        No successful prediction run yet.{' '}
        <Link to="/data" className="font-medium text-primary hover:underline">
          Run a prediction refresh →
        </Link>
      </p>
    )
  }
  const model = (info) => (info ? `${info.model_name} v${info.model_version} (${runLabel(info.model_run_id)})` : '—')
  const facts = [
    ['Data cutoff', formatDate(run.data_cutoff_date)],
    ['Prediction date', formatDate(run.prediction_date)],
    ['Demand model', model(run.demand_forecast)],
    ['Stockout model', model(run.stockout)],
    ['Completed', formatDateTime(run.completed_at)],
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border/70 bg-card/60 px-4 py-3 text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <Activity className="size-3.5 text-primary" aria-hidden="true" />
        Prediction run
      </span>
      {facts.map(([label, value]) => (
        <span key={label} className="text-muted-foreground">
          {label} <span className="font-medium text-foreground">{value}</span>
        </span>
      ))}
    </div>
  )
}

/** Product Analysis (`/products/:itemId`, plan §7.6) – one read-only decision view built from GET /products/{id}/analysis. */
export default function ProductAnalysisPage() {
  const { itemId } = useParams()
  const { data, isPending, isError, error, refetch, isFetching } = useProductAnalysis(itemId)

  if (isPending) return <PageSkeleton />
  if (isError && error?.status === 404) return <NotFoundCard itemId={itemId} />
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
          <RecommendationSection recommendation={data.recommendation} unit={unit} />
          <StockoutRiskSection stockoutRisk={data.stockout_risk} itemId={data.item.item_id} />
          <ForecastSection forecast={data.forecast} unit={unit} itemId={data.item.item_id} />
        </div>
        <div className="min-w-0">
          <LiveContextSection analysis={data} />
        </div>
      </div>

      <RunFooter run={data.prediction_run} />
    </div>
  )
}
