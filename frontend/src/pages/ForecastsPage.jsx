import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import Expandable from '@/components/common/Expandable'
import NoPredictionsCard from '@/components/common/NoPredictionsCard'
import PageHeader from '@/components/common/PageHeader'
import ProductPicker from '@/components/common/ProductPicker'
import ActualForecastChart from '@/components/charts/ActualForecastChart'
import ForecastByStoreChart from '@/components/charts/ForecastByStoreChart'
import { useForecasts, useWeeklyDemand } from '@/api/hooks'
import { isNoPredictionRunError } from '@/api/client'
import { ALL, useUrlFilters } from '@/hooks/use-url-filters'
import { SUB_STORES, storeName } from '@/lib/enums'
import { formatDate, formatNumber, parseDate } from '@/lib/format'
import { trendMeta, unitWord } from '@/lib/trend'
import { cn } from '@/lib/utils'

const FILTER_KEYS = ['item_id', 'store_id']
/** Completed weeks of recorded demand drawn before the four forecast weeks. */
const HISTORY_WEEKS = 12
const DAY_MS = 86_400_000

/** The store the chart shows when none is chosen: the one with the largest expected demand over the four weeks. */
function largestStore(rows) {
  const totals = new Map()
  for (const row of rows) totals.set(row.store_id, (totals.get(row.store_id) ?? 0) + (row.p50 ?? 0))
  let best = null
  for (const [storeId, total] of totals) if (best == null || total > best.total) best = { storeId, total }
  return best?.storeId ?? null
}

/**
 * Whether the four forecast weeks are still ahead. "current": today falls between the week before the first forecast
 * week and the end of the last one, so the marker reads "Today". "past": the whole period has gone by, so the page
 * says "Past forecast" with its dates. "future": the forecast has not started yet.
 */
function forecastTiming(forecastRows, now = new Date()) {
  const sorted = [...forecastRows].sort((a, b) => a.target_week.localeCompare(b.target_week))
  if (!sorted.length) return null
  const start = parseDate(sorted[0].target_week)
  const lastStart = parseDate(sorted[sorted.length - 1].target_week)
  if (!start || !lastStart) return null
  const end = new Date(lastStart.getTime() + 6 * DAY_MS)
  const status = now > end ? 'past' : now >= new Date(start.getTime() - 7 * DAY_MS) ? 'current' : 'future'
  return { status, start, end, startIso: sorted[0].target_week }
}

function ResultSkeleton() {
  return (
    <Card className="gap-4">
      <CardContent className="space-y-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-[300px] w-full" />
      </CardContent>
    </Card>
  )
}

/**
 * Forecasts (`/forecasts`, plan §7.5, redesigned for the officer): search for a product, pick a store, and see one
 * "Actual demand and forecast" chart with a one-line summary, and a collapsed bar chart comparing all sub-stores. Selection lives in the URL (`item_id`, `store_id`). The chart shows one store at a
 * time: store P50/P90 values are never summed into a hospital-wide figure.
 */
export default function ForecastsPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const itemId = filters.item_id
  const chosenStore = filters.store_id

  // All stores for the comparison and the default store; then the chosen store's four weeks with their trend.
  const allQuery = useForecasts({ item_id: itemId, limit: 100 }, { enabled: Boolean(itemId) })
  const allRows = useMemo(() => allQuery.data?.items ?? [], [allQuery.data])
  const autoStore = useMemo(() => largestStore(allRows), [allRows])
  // A store has a forecast only if it stocks (has recorded demand for) the product; only those stores are listed.
  // Before a product is chosen, or while its rows load, every sub-store is listed.
  const storesWithForecast = useMemo(() => new Set(allRows.map((row) => row.store_id)), [allRows])
  const storeOptions = useMemo(
    () => (itemId && storesWithForecast.size > 0 ? SUB_STORES.filter((store) => storesWithForecast.has(store.store_id)) : SUB_STORES),
    [itemId, storesWithForecast],
  )
  const storeId = chosenStore || autoStore
  const storeQuery = useForecasts({ item_id: itemId, store_id: storeId, limit: 10 }, { enabled: Boolean(itemId && storeId) })
  const run = storeQuery.data?.run ?? allQuery.data?.run ?? null
  const forecastRows = useMemo(() => [...(storeQuery.data?.items ?? [])].sort((a, b) => a.horizon - b.horizon), [storeQuery.data])
  const history = useWeeklyDemand(
    { item_id: itemId, store_id: storeId, weeks: HISTORY_WEEKS, end_date: run?.prediction_date },
    { enabled: Boolean(itemId && storeId && run?.prediction_date) },
  )

  const first = allRows[0]
  const itemLabel = itemId && first?.item_id === itemId ? first.item_name : undefined
  const unit = first?.unit
  const unitLabel = unitWord(unit)
  const timing = useMemo(() => forecastTiming(forecastRows), [forecastRows])
  const trend = trendMeta(storeQuery.data?.trend)
  const meanExpected = forecastRows.length ? forecastRows.reduce((sum, row) => sum + row.p50, 0) / forecastRows.length : null

  if (itemId && allQuery.isError && isNoPredictionRunError(allQuery.error)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Forecasts" description="Search for a product to see how much demand to expect each week, and whether it is rising, falling or steady." />
        <NoPredictionsCard description="Import data and run a prediction refresh to see weekly demand forecasts here." />
      </div>
    )
  }

  let result
  if (!itemId) {
    result = (
      <Card>
        <EmptyState icon={Search} title="Search for a product to see its forecast." description="Type part of the product name above, for example “chest drain”, and pick the size you need." />
      </Card>
    )
  } else if (allQuery.isPending || (storeId && storeQuery.isPending)) {
    result = <ResultSkeleton />
  } else if (allQuery.isError || storeQuery.isError) {
    const failed = allQuery.isError ? allQuery : storeQuery
    result = (
      <Card>
        <ErrorState error={failed.error} onRetry={failed.refetch} retrying={failed.isFetching} />
      </Card>
    )
  } else if (allRows.length === 0) {
    result = (
      <Card>
        <EmptyState icon={TrendingUp} title="No forecast for this product in the latest predictions." description="Forecasts cover the ten sub-stores. This product may have had no recorded demand there." />
      </Card>
    )
  } else if (forecastRows.length === 0) {
    result = (
      <Card>
        <EmptyState
          icon={TrendingUp}
          title={`${storeName(storeId)} does not stock this product.`}
          description={`It is stocked at ${[...storesWithForecast].map(storeName).join(', ')}. Choose one of those stores above.`}
        />
      </Card>
    )
  } else {
    const historyRows = history.data?.weeks ?? []
    const historyMissing = !history.isPending && (history.isError || historyRows.every((row) => row.demand_qty == null))
    const markerLabel = timing?.status === 'current' ? 'Today' : 'Forecast starts'
    result = (
      <Card className="gap-5">
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Weekly demand</h2>
              <p className="text-sm text-foreground">
                <span className="font-medium">{itemLabel ?? itemId}</span>
                <span className="text-muted-foreground"> · {storeName(storeId)}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              <Button asChild variant="ghost" size="sm" className="text-primary hover:bg-accent">
                <Link to={`/products/${encodeURIComponent(itemId)}`}>
                  View product analysis
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="text-base font-semibold text-foreground">
              About {formatNumber(Math.round(meanExpected))} {unitLabel} per week
              {trend ? <span className="font-normal text-muted-foreground"> · {trend.short}.</span> : null}
            </p>
            {timing ? (
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', timing.status === 'past' ? 'bg-muted text-muted-foreground' : 'bg-info-bg text-[#1d4ed8]')}>
                {`Forecast covers ${formatDate(timing.start)} – ${formatDate(timing.end)}`}
                {timing.status === 'past' ? ' (this period has passed)' : timing.status === 'current' ? ' (the next four weeks)' : ''}
              </span>
            ) : null}
          </div>

          {history.isPending ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ActualForecastChart history={history.isError ? [] : historyRows} forecast={forecastRows} unit={unit} markerLabel={markerLabel} />
          )}
          {historyMissing ? (
            <p className="text-xs text-muted-foreground">
              {history.isError ? 'Past weeks could not be loaded; the forecast is shown on its own.' : 'No recorded demand for the past weeks at this store; the forecast is shown on its own.'}
            </p>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Forecasts" description="Search for a product to see how much demand to expect each week, and whether it is rising, falling or steady.">
        {run ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Data through <span className="font-medium text-foreground">{formatDate(run.data_cutoff_date)}</span>
          </p>
        ) : null}
      </PageHeader>

      <Card className="gap-4">
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="forecast-item" className="mb-1.5 text-sm font-medium text-foreground">
                Search for a product
              </Label>
              <ProductPicker id="forecast-item" value={itemId} label={itemLabel} placeholder="Type a product name, e.g. chest drain catheter…" buttonClassName="h-11 text-[15px]" onChange={(next) => update({ item_id: next })} />
            </div>
            <div className="md:w-[23rem]">
              <Label htmlFor="forecast-store" className="mb-1.5 text-sm font-medium text-foreground">
                Store
              </Label>
              <Select value={chosenStore || ALL} onValueChange={(value) => update({ store_id: value })}>
                <SelectTrigger id="forecast-store" className="h-11 w-full bg-card">
                  <SelectValue placeholder="Store with the highest expected demand" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>Store with the highest expected demand</SelectItem>
                  {storeOptions.map((store) => (
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

      {result}

      {itemId && allRows.length > 1 ? (
        <Expandable title="Compare stores" description="Expected demand per week at every sub-store, to see where this product is used most">
          <ForecastByStoreChart rows={allRows} unit={unit} />
        </Expandable>
      ) : null}
    </div>
  )
}
