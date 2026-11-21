import { Link } from 'react-router-dom'
import { ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import NoPredictionsCard from '@/components/common/NoPredictionsCard'
import PageHeader from '@/components/common/PageHeader'
import ProbabilityBar from '@/components/common/ProbabilityBar'
import ProductPicker from '@/components/common/ProductPicker'
import RunFacts from '@/components/common/RunFacts'
import TablePagination from '@/components/common/TablePagination'
import { RiskBadge } from '@/components/common/ToneBadge'
import { useStockoutRisks } from '@/api/hooks'
import { isNoPredictionRunError } from '@/api/client'
import { ALL, useUrlFilters } from '@/hooks/use-url-filters'
import { RISK_LEVELS, RISK_LEVEL_META, SUB_STORES, storeName } from '@/lib/enums'
import { formatDate, formatNumber } from '@/lib/format'

const FILTER_KEYS = ['risk_level', 'store_id', 'item_id']
const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/**
 * Stockout Risk Centre (`/stockout-risks`, plan §7.2): every store × item stockout prediction of the latest run,
 * filtered by risk level, sub-store and item, paginated 25/50/100. Filters live in the URL (plan §5.4).
 */
export default function StockoutRisksPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const query = useStockoutRisks(
    { risk_level: filters.risk_level, store_id: filters.store_id, item_id: filters.item_id, limit: filters.limit, offset: filters.offset },
    { placeholderData: (previous) => previous },
  )

  const rows = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const run = query.data?.run ?? null
  const sample = rows[0]
  const hasFilters = Boolean(filters.risk_level || filters.store_id || filters.item_id)
  const itemLabel = filters.item_id && rows.length && rows[0].item_id === filters.item_id ? rows[0].item_name : undefined

  if (query.isError && isNoPredictionRunError(query.error)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Stockout Risk Centre" description="Every item at every store, sorted by how likely it is to run out in the next two weeks." />
        <NoPredictionsCard description="Import data and run a prediction refresh to see store × item stockout risks here." />
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
        icon={ShieldCheck}
        title={hasFilters ? 'No store × item risks match these filters.' : 'No store × item risks in the latest run.'}
        description={hasFilters ? 'Try another risk level, store or item, or clear the filters.' : undefined}
      />
    )
  } else {
    body = (
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>Item</TableHead>
            <TableHead className={HEAD}>Store</TableHead>
            <TableHead className={`${HEAD} text-right`}>Probability</TableHead>
            <TableHead className={HEAD}>Risk level</TableHead>
            <TableHead className={`${HEAD} text-right`}>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.item_id}-${row.store_id}`} className="border-border/70">
              <TableCell className="w-full min-w-[220px] max-w-0 px-2 py-3">
                <Link to={`/products/${row.item_id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={row.item_name}>
                  {row.item_name}
                </Link>
                <span className="block text-xs text-muted-foreground">{row.item_id}</span>
              </TableCell>
              <TableCell className="px-2 py-3 text-sm text-foreground">
                <span className="block max-w-[220px] truncate" title={row.store_name}>
                  {row.store_name ?? storeName(row.store_id)}
                </span>
                <span className="block text-xs text-muted-foreground">{row.store_id}</span>
              </TableCell>
              <TableCell className="px-2 py-3 text-sm">
                <ProbabilityBar probability={row.probability} />
              </TableCell>
              <TableCell className="px-2 py-3">
                <RiskBadge level={row.risk_level} className="px-2" />
              </TableCell>
              <TableCell className="px-2 py-3 text-right">
                <Button asChild size="sm" variant={row.risk_level === 'URGENT' ? 'default' : 'outline'} className="rounded-lg">
                  <Link to={`/products/${row.item_id}`}>View analysis</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Stockout Risk Centre" description="Every item at every store, sorted by how likely it is to run out in the next two weeks. Open one to see why and what to do.">
        <RunFacts
          className="mt-3"
          loading={query.isPending}
          title="Predictions"
          items={[
            { label: 'Made on', value: formatDate(run?.prediction_date) },
            { label: 'Data up to', value: formatDate(run?.data_cutoff_date) },
            ...(sample ? [{ label: 'Looking ahead', value: `${formatNumber(sample.horizon_days)} days` }] : []),
          ]}
        />
      </PageHeader>

      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div>
              <Label htmlFor="risk-level" className="mb-1.5 text-xs text-muted-foreground">
                Risk level
              </Label>
              <Select value={filters.risk_level || ALL} onValueChange={(value) => update({ risk_level: value })}>
                <SelectTrigger id="risk-level" className="h-9 w-full bg-card md:w-[10rem]">
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All levels</SelectItem>
                  {RISK_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {RISK_LEVEL_META[level].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="risk-store" className="mb-1.5 text-xs text-muted-foreground">
                Store
              </Label>
              <Select value={filters.store_id || ALL} onValueChange={(value) => update({ store_id: value })}>
                <SelectTrigger id="risk-store" className="h-9 w-full bg-card md:w-[17rem]">
                  <SelectValue placeholder="All sub-stores" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All sub-stores</SelectItem>
                  {SUB_STORES.map((store) => (
                    <SelectItem key={store.store_id} value={store.store_id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 flex-1 md:min-w-[16rem]">
              <Label htmlFor="risk-item" className="mb-1.5 text-xs text-muted-foreground">
                Item
              </Label>
              <ProductPicker id="risk-item" value={filters.item_id} label={itemLabel} onChange={(itemId) => update({ item_id: itemId })} />
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => update({ risk_level: '', store_id: '', item_id: '' })}>
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
                : `${formatNumber(total)} store × item row${total === 1 ? '' : 's'}${hasFilters ? ' match' : ' predicted'}`}
            {query.isFetching && !query.isPending ? ' · updating…' : ''}
          </p>

          {body}

          {!query.isPending && !query.isError && total > 0 ? (
            <TablePagination total={total} limit={filters.limit} offset={filters.offset} onChange={(next) => update(next, { resetOffset: false })} disabled={query.isFetching} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
