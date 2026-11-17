import { Link } from 'react-router-dom'
import { ClipboardList, Database, PackageOpen, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import KpiCard from '@/components/common/KpiCard'
import ErrorState from '@/components/common/ErrorState'
import StaleBanner from '@/components/common/StaleBanner'
import LastUpdatedCard from '@/components/dashboard/LastUpdatedCard'
import StockoutRiskTable from '@/components/dashboard/StockoutRiskTable'
import TopPurchaseTable from '@/components/dashboard/TopPurchaseTable'
import QuickActions from '@/components/dashboard/QuickActions'
import { DASHBOARD_REFETCH_MS, useDashboardSummary, usePurchaseOrders, useRecommendations, useStockoutRisks } from '@/api/hooks'
import { EM_DASH, formatNumber, greetingForHour } from '@/lib/format'

const POLL = { refetchInterval: DASHBOARD_REFETCH_MS }
/** Rows in the "most urgent stockout alerts" table. */
const TOP_ALERTS = 10

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
 * Dashboard (plan §7.1, simplified for the procurement officer): the most urgent stockout alerts first, then the
 * purchase advice to act on. Three KPI cards, no charts and no model details (those live on Data & Predictions).
 * Every number comes from the backend.
 */
export default function DashboardPage() {
  const summaryQuery = useDashboardSummary(POLL)
  const topRisks = useStockoutRisks({ limit: TOP_ALERTS }, POLL)
  const topPurchases = useRecommendations({ action: 'PURCHASE', limit: 5 }, POLL)
  const openPOs = usePurchaseOrders({ status: 'Open', limit: 1 }, POLL)

  const summary = summaryQuery.data
  const summaryLoading = summaryQuery.isPending
  const run = summary?.prediction_run ?? null
  const hasRun = Boolean(run)
  const setStatus = summary?.recommendation_set?.status ?? null
  const setMissing = hasRun && setStatus === 'missing'
  // ISO dates compare correctly as strings.
  const dataNewer = Boolean(hasRun && summary?.latest_data_date && run.data_cutoff_date && summary.latest_data_date > run.data_cutoff_date)

  const riskCounts = summary?.stockout_risk_counts

  const kpiValue = (value, available = true) => (available && value != null ? formatNumber(value) : EM_DASH)

  const openPoValue = openPOs.isError ? EM_DASH : formatNumber(openPOs.data?.total)
  const openPoCaption = openPOs.isError ? 'unavailable' : 'order lines with status Open'

  return (
    <div className="space-y-6">
      {/* Greeting + last-updated card */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[1.65rem] font-semibold tracking-tight text-foreground">{greetingForHour()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here is what needs your attention: items likely to run out, and what to order next.</p>
        </div>
        <LastUpdatedCard timestamp={summary?.latest_prediction_timestamp} loading={summaryLoading} />
      </div>

      {summaryQuery.isError ? (
        <Card>
          <ErrorState error={summaryQuery.error} onRetry={summaryQuery.refetch} retrying={summaryQuery.isFetching} />
        </Card>
      ) : null}

      {setMissing ? (
        <StaleBanner title="Recommendations for the latest predictions are missing." to="/data" actionLabel="Generate recommendations" />
      ) : null}
      {dataNewer ? (
        <StaleBanner
          title="New data was imported after the last predictions. Run a prediction refresh to update them."
          description={`Latest data ${summary.latest_data_date} · predictions use data up to ${run.data_cutoff_date}`}
          to="/data"
          actionLabel="Open Data & Predictions"
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <KpiCard
              title="Items at urgent stockout risk"
              icon={ShieldAlert}
              tone="danger"
              highlight
              loading={summaryLoading}
              value={kpiValue(riskCounts?.URGENT, hasRun)}
              caption={hasRun && riskCounts ? `+${formatNumber(riskCounts.REVIEW)} to review` : 'no predictions yet'}
              to="/stockout-risks?risk_level=URGENT"
            />
            <KpiCard
              title="Items needing action"
              icon={PackageOpen}
              tone="info"
              loading={summaryLoading}
              value={kpiValue(summary?.items_needing_attention, hasRun && !setMissing)}
              caption={summary ? `of ${formatNumber(summary.total_items)} items` : undefined}
              to="/recommendations"
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

          {/* A grid, not a block column: WidgetCard is h-full, which only sizes to content inside grid rows. */}
          <div className="grid gap-6">
            <StockoutRiskTable query={topRisks} hasRun={hasRun || summaryLoading} rows={TOP_ALERTS} />
            <TopPurchaseTable query={topPurchases} setStatus={setStatus} hasRun={hasRun || summaryLoading} />
          </div>
        </div>

        {/* Right column */}
        <div className="min-w-0 xl:content-start">
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
