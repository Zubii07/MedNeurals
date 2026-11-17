import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import NoPredictionsCard from '@/components/common/NoPredictionsCard'
import PageHeader from '@/components/common/PageHeader'
import ProductPicker from '@/components/common/ProductPicker'
import RunFacts from '@/components/common/RunFacts'
import DemandHistoryChart from '@/components/charts/DemandHistoryChart'
import ForecastByStoreTable from '@/components/forecasts/ForecastByStoreTable'
import { useForecasts, useWeeklyDemand } from '@/api/hooks'
import { isNoPredictionRunError } from '@/api/client'
import { ALL, useUrlFilters } from '@/hooks/use-url-filters'
import { SUB_STORES, storeName } from '@/lib/enums'
import { formatDate, formatForecast, horizonLabel } from '@/lib/format'

const FILTER_KEYS = ['item_id', 'store_id']
const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/** Weeks of recorded demand drawn before the four forecast weeks. */
const HISTORY_WEEKS = 26

/**
 * One store (plan §7.5): one line of weekly demand – the last 26 recorded weeks at this store (GET /demand/weekly)
 * and the four forecast weeks – plus a plain P50 / P90 table. The P90 range is drawn only when switched on.
 */
function StoreForecast({ rows, unit, itemId, storeId, predictionDate }) {
  const [showRange, setShowRange] = useState(false)
  const sorted = useMemo(() => [...rows].sort((a, b) => a.horizon - b.horizon), [rows])
  const history = useWeeklyDemand({ item_id: itemId, store_id: storeId, weeks: HISTORY_WEEKS, end_date: predictionDate ?? undefined }, { enabled: Boolean(predictionDate) })

  let chart
  if (history.isPending) chart = <Skeleton className="h-[260px] w-full" />
  else if (history.isError) chart = <ErrorState error={history.error} onRetry={history.refetch} retrying={history.isFetching} compact />
  else chart = <DemandHistoryChart history={history.data?.weeks ?? []} forecast={sorted} unit={unit} showRange={showRange} />

  return (
    <div className="space-y-5">
      {chart}
      <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
        <Switch checked={showRange} onCheckedChange={setShowRange} aria-label="Show the P90 range" />
        Show the high estimate (P90) range
      </label>
      <Table className="min-w-[480px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>Horizon</TableHead>
            <TableHead className={HEAD}>Week of</TableHead>
            <TableHead className={`${HEAD} text-right`}>P50{unit ? ` (${unit})` : ''}</TableHead>
            <TableHead className={`${HEAD} text-right`}>P90{unit ? ` (${unit})` : ''}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.horizon} className="border-border/70">
              <TableCell className="px-2 py-2.5 text-sm font-medium">{horizonLabel(row.horizon)}</TableCell>
              <TableCell className="px-2 py-2.5 text-sm">{formatDate(row.target_week)}</TableCell>
              <TableCell className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums">{formatForecast(row.p50)}</TableCell>
              <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{formatForecast(row.p90)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ResultSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-[260px] w-full" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Forecasts (`/forecasts`, plan §7.5): pick an item (and optionally a sub-store) to see the latest saved
 * weekly demand forecast for horizons H1–H4. Selection lives in the URL (`item_id`, `store_id`).
 */
export default function ForecastsPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const itemId = filters.item_id
  const storeId = filters.store_id
  // No placeholder data here: the one-store view and the all-stores view have different shapes.
  const query = useForecasts({ item_id: itemId, store_id: storeId, limit: 100 }, { enabled: Boolean(itemId) })

  const rows = query.data?.items ?? []
  const run = query.data?.run ?? null
  const first = rows[0]
  const itemLabel = itemId && first?.item_id === itemId ? first.item_name : undefined
  const unit = first?.unit

  if (itemId && query.isError && isNoPredictionRunError(query.error)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Forecasts" description="Weekly demand for the next four weeks, per sub-store, from the latest saved forecast." />
        <NoPredictionsCard description="Import data and run a prediction refresh to see weekly demand forecasts here." />
      </div>
    )
  }

  let result
  if (!itemId) {
    result = <EmptyState icon={TrendingUp} title="Pick an item to see its forecast." description="Search for an item above; choose one sub-store to see its demand line, or keep all stores for the table." />
  } else if (query.isPending) {
    result = <ResultSkeleton />
  } else if (query.isError) {
    result = <ErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
  } else if (rows.length === 0) {
    result = (
      <EmptyState
        icon={TrendingUp}
        title={storeId ? `No forecast for this item at ${storeName(storeId)} in the latest run.` : 'No forecast for this item in the latest run.'}
        description={storeId ? 'Forecasts exist for the ten sub-stores only. Try another store.' : undefined}
      />
    )
  } else if (storeId) {
    result = <StoreForecast rows={rows} unit={unit} itemId={itemId} storeId={storeId} predictionDate={run?.prediction_date ?? null} />
  } else {
    result = <ForecastByStoreTable rows={rows} unit={unit} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Forecasts" description="Weekly demand for the next four weeks, per sub-store, from the latest saved forecast.">
        <RunFacts
          className="mt-3"
          loading={Boolean(itemId) && query.isPending}
          title="Predictions"
          items={
            run
              ? [
                  { label: 'Made on', value: formatDate(run.prediction_date) },
                  { label: 'Data up to', value: formatDate(run.data_cutoff_date) },
                ]
              : [{ label: 'Details', value: 'shown once an item is selected' }]
          }
        />
      </PageHeader>

      <Card className="gap-4">
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="min-w-0 flex-1 md:min-w-[18rem]">
              <Label htmlFor="forecast-item" className="mb-1.5 text-xs text-muted-foreground">
                Item
              </Label>
              <ProductPicker id="forecast-item" value={itemId} label={itemLabel} placeholder="Search for an item…" onChange={(next) => update({ item_id: next })} />
            </div>
            <div>
              <Label htmlFor="forecast-store" className="mb-1.5 text-xs text-muted-foreground">
                Store
              </Label>
              <Select value={storeId || ALL} onValueChange={(value) => update({ store_id: value })}>
                <SelectTrigger id="forecast-store" className="h-9 w-full bg-card md:w-[17rem]">
                  <SelectValue placeholder="All stores" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All stores</SelectItem>
                  {SUB_STORES.map((store) => (
                    <SelectItem key={store.store_id} value={store.store_id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader className="gap-0.5">
          <CardTitle className="min-w-0 text-base font-semibold">
            {itemId ? (
              <>
                <span className="block truncate">{itemLabel ?? itemId}</span>
                {itemLabel ? <span className="block text-xs font-normal text-muted-foreground">{itemId}</span> : null}
              </>
            ) : (
              'Demand forecast'
            )}
          </CardTitle>
          <CardDescription className="min-w-0 text-xs">
            {storeId ? `${storeName(storeId)} · the last ${HISTORY_WEEKS} weeks and the next four` : 'All sub-stores · next four weeks, P50 / P90 per store'}
            {query.isFetching && !query.isPending ? ' · updating…' : ''}
          </CardDescription>
          {itemId ? (
            <CardAction className="self-center">
              <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-accent">
                <Link to={`/products/${encodeURIComponent(itemId)}`}>
                  Product analysis
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="min-w-0">{result}</CardContent>
      </Card>
    </div>
  )
}
