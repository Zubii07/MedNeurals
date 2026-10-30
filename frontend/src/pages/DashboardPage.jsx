import { Link } from 'react-router-dom'
import { ClipboardList, Database, PackageOpen, ShieldAlert, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import KpiCard from '@/components/common/KpiCard'
import ErrorState from '@/components/common/ErrorState'
import StaleBanner from '@/components/common/StaleBanner'
import LastUpdatedCard from '@/components/dashboard/LastUpdatedCard'
import StockoutRiskTable from '@/components/dashboard/StockoutRiskTable'
import RiskByStoreCard from '@/components/dashboard/RiskByStoreCard'
import RiskMixCard from '@/components/dashboard/RiskMixCard'
import TopPurchaseTable from '@/components/dashboard/TopPurchaseTable'
import PredictionRunCard from '@/components/dashboard/PredictionRunCard'
import RecommendationSpotlight from '@/components/dashboard/RecommendationSpotlight'
import QuickActions from '@/components/dashboard/QuickActions'
import PromoBanner from '@/components/dashboard/PromoBanner'
import {
  DASHBOARD_REFETCH_MS,
  useDashboardSummary,
  useInventory,
  usePurchaseOrders,
  useRecommendations,
  useStockoutRisks,
} from '@/api/hooks'
import { EM_DASH, formatNumber, greetingForHour } from '@/lib/format'

const POLL = { refetchInterval: DASHBOARD_REFETCH_MS }

/** Full-width card shown when there is no successful prediction run (plan §7.1). */
function NoPredictionsCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
          <Database className="size-6" aria-hidden="true" />
        </span>
        <p className="text-base font-semibold">No predictions yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Import data and run a prediction refresh to see demand forecasts, stockout risks and recommendations here.
        </p>
        <Button asChild className="mt-1 rounded-xl">
          <Link to="/data">Go to Data & Predictions</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * Dashboard (plan §3.1 layout, §4 mapping, §7.1 states). Every number comes from the backend;
 * the only client-side work is counting returned rows per store for the bar chart.
 */
export default function DashboardPage() {
  const summaryQuery = useDashboardSummary(POLL)
  const topRisks = useStockoutRisks({ limit: 5 }, POLL)
  const urgentRisks = useStockoutRisks({ risk_level: 'URGENT', limit: 1000 }, POLL)
  const reviewRisks = useStockoutRisks({ risk_level: 'REVIEW', limit: 1000 }, POLL)
  const spotlight = useRecommendations({ limit: 1 }, POLL)
  const topPurchases = useRecommendations({ action: 'PURCHASE', limit: 5 }, POLL)
  const openPOs = usePurchaseOrders({ status: 'Open', limit: 1 }, POLL)
  const stockoutsNow = useInventory({ latest: true, stockout_only: true, limit: 1 }, POLL)

  const summary = summaryQuery.data
  const summaryLoading = summaryQuery.isPending
  const run = summary?.prediction_run ?? null
  const hasRun = Boolean(run)
  const setStatus = summary?.recommendation_set?.status ?? null
  const setMissing = hasRun && setStatus === 'missing'
  // ISO dates compare correctly as strings.
  const dataNewer = Boolean(hasRun && summary?.latest_data_date && run.data_cutoff_date && summary.latest_data_date > run.data_cutoff_date)

  const riskCounts = summary?.stockout_risk_counts
  const priorityCounts = summary?.recommendation_priority_counts

  const kpiValue = (value, available = true) => (available && value != null ? formatNumber(value) : EM_DASH)

  const openPoValue = openPOs.isError ? EM_DASH : formatNumber(openPOs.data?.total)
  const openPoCaption = openPOs.isError ? 'unavailable' : 'order lines with status Open'

  return (
    <div className="space-y-6">
      {/* Greeting + last-updated card */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-foreground">{greetingForHour()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's the latest forecast, stockout risk and procurement advice for your hospital.
          </p>
        </div>
        <LastUpdatedCard timestamp={summary?.latest_prediction_timestamp} loading={summaryLoading} />
      </div>

      {summaryQuery.isError ? (
        <Card>
          <ErrorState error={summaryQuery.error} onRetry={summaryQuery.refetch} retrying={summaryQuery.isFetching} />
        </Card>
      ) : null}

      {setMissing ? (
        <StaleBanner
          title="Recommendations for the latest prediction run are missing. Showing none."
          to="/data"
          actionLabel="Generate recommendations"
        />
      ) : null}
      {dataNewer ? (
        <StaleBanner
          title="New data imported after the last prediction run. Run a prediction refresh."
          description={`Latest data ${summary.latest_data_date} · run cutoff ${run.data_cutoff_date}`}
          to="/data"
          actionLabel="Open Data & Predictions"
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Items at urgent stockout risk"
              icon={ShieldAlert}
              tone="danger"
              highlight
              loading={summaryLoading}
              value={kpiValue(riskCounts?.URGENT, hasRun)}
              caption={hasRun && riskCounts ? `+${formatNumber(riskCounts.REVIEW)} under review` : 'no prediction run'}
              to="/stockout-risks?risk_level=URGENT"
            />
            <KpiCard
              title="Items needing attention"
              icon={PackageOpen}
              tone="info"
              loading={summaryLoading}
              value={kpiValue(summary?.items_needing_attention, hasRun && !setMissing)}
              caption={summary ? `of ${formatNumber(summary.total_items)} items` : undefined}
              to="/recommendations"
            />
            <KpiCard
              title="High-priority recommendations"
              icon={Sparkles}
              tone="success"
              loading={summaryLoading}
              value={kpiValue(priorityCounts?.HIGH, hasRun && !setMissing)}
              caption={hasRun && !setMissing && priorityCounts ? `+${formatNumber(priorityCounts.MODERATE)} moderate` : setMissing ? 'set missing' : 'no prediction run'}
              to="/recommendations?priority=HIGH"
            />
            <KpiCard
              title="Open purchase orders"
              icon={ClipboardList}
              tone="violet"
              loading={openPOs.isPending}
              value={openPoValue}
              caption={openPoCaption}
              to="/purchase-orders?status=Open"
            />
          </div>

          {!summaryLoading && !summaryQuery.isError && !hasRun ? <NoPredictionsCard /> : null}

          <div className="grid gap-6 xl:grid-cols-3 2xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-2 2xl:col-span-3">
              <StockoutRiskTable query={topRisks} hasRun={hasRun || summaryLoading} />
            </div>
            <div className="grid min-w-0 gap-6 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1 xl:content-start 2xl:col-span-2">
              <RiskByStoreCard urgentQuery={urgentRisks} reviewQuery={reviewRisks} predictionDate={run?.prediction_date} hasRun={hasRun || summaryLoading} />
              <RiskMixCard summary={summary} loading={summaryLoading} stockoutQuery={stockoutsNow} />
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3 2xl:grid-cols-5">
            <div className="min-w-0 xl:col-span-2 2xl:col-span-3">
              <TopPurchaseTable query={topPurchases} setStatus={setStatus} hasRun={hasRun || summaryLoading} />
            </div>
            <div className="min-w-0 xl:col-span-1 2xl:col-span-2">
              <PredictionRunCard summary={summary} loading={summaryLoading} dataNewer={dataNewer} />
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="grid min-w-0 gap-6 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <RecommendationSpotlight query={spotlight} setStatus={setStatus} hasRun={hasRun || summaryLoading} />
          <QuickActions />
          <div className="md:col-span-2 xl:col-span-1">
            <PromoBanner />
          </div>
        </div>
      </div>
    </div>
  )
}
