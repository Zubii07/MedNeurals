import { useParams } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/common/ErrorState'
import NotFoundCard from '@/components/common/NotFoundCard'
import ProductSummaryHeader from '@/components/product/ProductSummaryHeader'
import MainWarningCard from '@/components/product/MainWarningCard'
import InventorySummary from '@/components/product/InventorySummary'
import DemandForecastSection from '@/components/product/DemandForecastSection'
import StockAndSupplySection from '@/components/product/StockAndSupplySection'
import { useProductAnalysis } from '@/api/hooks'

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-40" />
      <Skeleton className="h-96" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14" />
        ))}
      </div>
    </div>
  )
}

/**
 * Product page (`/products/:itemId`, plan §7.6, redesigned for the officer): five sections, top to bottom –
 * the compact product header, the warning and recommended action, current inventory, the demand forecast, and stock by
 * store with incoming supply. One read of GET /products/{id}/analysis plus the weekly demand history and the explanation paragraph.
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

  return (
    <div className="space-y-7">
      <ProductSummaryHeader analysis={data} />
      <MainWarningCard analysis={data} />
      <InventorySummary analysis={data} />
      <DemandForecastSection forecast={data.forecast} unit={data.item?.uom} itemId={data.item.item_id} predictionDate={data.prediction_run?.prediction_date ?? null} />
      <StockAndSupplySection analysis={data} />
    </div>
  )
}
