import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import NoPredictionsCard from '@/components/common/NoPredictionsCard'
import PageHeader from '@/components/common/PageHeader'
import ProductPicker from '@/components/common/ProductPicker'
import RunFacts from '@/components/common/RunFacts'
import StaleBanner from '@/components/common/StaleBanner'
import TablePagination from '@/components/common/TablePagination'
import RecommendationsTable from '@/components/recommendations/RecommendationsTable'
import { useRecommendations } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { ALL, useUrlFilters } from '@/hooks/use-url-filters'
import { ACTIONS, ACTION_META, PRIORITIES, PRIORITY_META, RECOMMENDATION_STATUSES, RECOMMENDATION_STATUS_META, SUB_STORES } from '@/lib/enums'
import { formatDate, formatDateTime, formatNumber, runLabel } from '@/lib/format'

const FILTER_KEYS = ['action', 'priority', 'status', 'store_id', 'item_id']

/**
 * Recommendations (`/recommendations`, plan §7.3): the saved recommendation set, with action tabs,
 * priority / status / store / item filters, a stale-set banner and expandable rows. Advisory only.
 */
export default function RecommendationsPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const query = useRecommendations(
    {
      action: filters.action,
      priority: filters.priority,
      status: filters.status,
      store_id: filters.store_id,
      item_id: filters.item_id,
      limit: filters.limit,
      offset: filters.offset,
    },
    { placeholderData: (previous) => previous },
  )

  const page = query.data
  const rows = page?.items ?? []
  const total = page?.total ?? 0
  const hasFilters = Boolean(filters.priority || filters.status || filters.store_id || filters.item_id)
  const hasAnyFilter = hasFilters || Boolean(filters.action)
  const itemLabel = filters.item_id && rows.length && rows[0].product_id === filters.item_id ? rows[0].product_name : undefined
  const stale = page?.freshness === 'stale'

  if (query.isError && query.error?.status === 404) {
    return (
      <div className="space-y-6">
        <PageHeader title="Recommendations" description="Saved purchase, transfer and expedite advice from the rule engine, with priority and reasoning." />
        <NoPredictionsCard
          title="No recommendations yet"
          description={`${errorMessage(query.error)}. Run a prediction refresh from Data & Predictions to generate the first set.`}
        />
      </div>
    )
  }

  let body
  if (query.isPending) {
    body = (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    )
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={Sparkles}
        title={hasAnyFilter ? 'No recommendations match these filters.' : 'The recommendation set has no rows.'}
        description={hasAnyFilter ? 'Try another tab, priority, status, store or item, or clear the filters.' : undefined}
      />
    )
  } else {
    body = <RecommendationsTable rows={rows} />
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Recommendations" description="Saved purchase, transfer and expedite advice from the rule engine, with priority and reasoning.">
        <RunFacts
          className="mt-3"
          title="Recommendation set"
          icon={Sparkles}
          loading={query.isPending}
          items={[
            { label: 'Run', value: runLabel(page?.model_run_id) },
            { label: 'Prediction date', value: formatDate(page?.prediction_date) },
            { label: 'Data cutoff', value: formatDate(page?.data_cutoff_date) },
            { label: 'Generated', value: formatDateTime(page?.generated_at) },
          ]}
        />
      </PageHeader>

      {stale ? (
        <StaleBanner
          title={`These recommendations belong to an older prediction run (${runLabel(page.model_run_id)}). Latest run: ${runLabel(page.latest_prediction_run_id)}.`}
          description={page.latest_prediction_date ? `Latest prediction date ${formatDate(page.latest_prediction_date)}.` : undefined}
          to="/data"
          actionLabel="Generate recommendations"
        />
      ) : null}

      <Card className="gap-4">
        <CardContent className="space-y-4">
          <Tabs value={filters.action || ALL} onValueChange={(value) => update({ action: value })}>
            <TabsList aria-label="Action" className="h-9 w-full justify-start overflow-x-auto md:w-fit [&>*]:flex-none">
              <TabsTrigger value={ALL} className="px-3">
                All
              </TabsTrigger>
              {ACTIONS.map((action) => (
                <TabsTrigger key={action} value={action} className="px-3">
                  {ACTION_META[action].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div>
              <Label htmlFor="rec-priority" className="mb-1.5 text-xs text-muted-foreground">
                Priority
              </Label>
              <Select value={filters.priority || ALL} onValueChange={(value) => update({ priority: value })}>
                <SelectTrigger id="rec-priority" className="h-9 w-full bg-card md:w-[10rem]">
                  <SelectValue placeholder="All priorities" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All priorities</SelectItem>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rec-status" className="mb-1.5 text-xs text-muted-foreground">
                Status
              </Label>
              <Select value={filters.status || ALL} onValueChange={(value) => update({ status: value })}>
                <SelectTrigger id="rec-status" className="h-9 w-full bg-card md:w-[10rem]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {RECOMMENDATION_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {RECOMMENDATION_STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rec-store" className="mb-1.5 text-xs text-muted-foreground">
                Store <span className="font-normal">(transfers)</span>
              </Label>
              <Select value={filters.store_id || ALL} onValueChange={(value) => update({ store_id: value })}>
                <SelectTrigger id="rec-store" className="h-9 w-full bg-card md:w-[17rem]">
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
            <div className="min-w-0 flex-1 md:min-w-[16rem]">
              <Label htmlFor="rec-item" className="mb-1.5 text-xs text-muted-foreground">
                Item
              </Label>
              <ProductPicker id="rec-item" value={filters.item_id} label={itemLabel} onChange={(itemId) => update({ item_id: itemId })} />
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => update({ priority: '', status: '', store_id: '', item_id: '' })}>
                <X aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {query.isPending
              ? 'Loading…'
              : query.isError
                ? ''
                : `${formatNumber(total)} recommendation${total === 1 ? '' : 's'}${hasAnyFilter ? ' match' : ''}`}
            {query.isFetching && !query.isPending ? ' · updating…' : ''}
          </p>

          {body}

          {!query.isPending && !query.isError && total > 0 ? (
            <TablePagination total={total} limit={filters.limit} offset={filters.offset} onChange={(next) => update(next, { resetOffset: false })} disabled={query.isFetching} />
          ) : null}

          <p className="text-xs text-muted-foreground">Advisory only – accept, adjust and reject arrive with officer login.</p>
        </CardContent>
      </Card>
    </div>
  )
}
