import { Boxes, History, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DateRangeFilter from '@/components/common/DateRangeFilter'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import PageHeader from '@/components/common/PageHeader'
import ProductPicker from '@/components/common/ProductPicker'
import RunFacts from '@/components/common/RunFacts'
import SwitchField from '@/components/common/SwitchField'
import TablePagination from '@/components/common/TablePagination'
import ToneBadge from '@/components/common/ToneBadge'
import { useInventory } from '@/api/hooks'
import { ALL, useUrlFilters } from '@/hooks/use-url-filters'
import { STORES, storeName } from '@/lib/enums'
import { EM_DASH, formatDate, formatNumber, isDateRangeInvalid } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTER_KEYS = ['item_id', 'store_id', 'stockout_only', 'start_date', 'end_date']
const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'
const NUM = 'px-2 py-2.5 text-right text-sm tabular-nums'

/**
 * Inventory (`/inventory`, plan §7.8): current stock per store × item by default (`latest=true`), or the daily
 * history once a date range is set. Filters and pagination live in the URL (plan §5.4). Rows carry ids only;
 * store names come from the fixed store list (§6.12).
 */
export default function InventoryPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const stockoutOnly = filters.stockout_only === 'true'
  const latest = !filters.start_date && !filters.end_date
  const rangeInvalid = isDateRangeInvalid(filters.start_date, filters.end_date)
  const query = useInventory(
    {
      item_id: filters.item_id,
      store_id: filters.store_id,
      stockout_only: stockoutOnly || undefined,
      start_date: filters.start_date,
      end_date: filters.end_date,
      latest: latest || undefined,
      limit: filters.limit,
      offset: filters.offset,
    },
    { placeholderData: (previous) => previous, enabled: !rangeInvalid },
  )

  const rows = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const hasFilters = Boolean(filters.item_id || filters.store_id || stockoutOnly || !latest)

  let viewFacts
  if (latest) {
    viewFacts = [{ label: 'Current stock', value: rows[0] ? `as of ${formatDate(rows[0].date)}` : 'latest inventory date' }]
  } else {
    const from = filters.start_date ? formatDate(filters.start_date) : null
    const to = filters.end_date ? formatDate(filters.end_date) : null
    viewFacts = [{ label: 'History', value: from && to ? `${from} – ${to}` : from ? `from ${from}` : `up to ${to}` }]
  }

  let body
  if (rangeInvalid) {
    body = <EmptyState icon={History} title="Fix the date range to load inventory rows." />
  } else if (query.isPending) {
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
        icon={Boxes}
        title={hasFilters ? 'No inventory rows match these filters.' : 'No inventory data yet.'}
        description={hasFilters ? 'Try another item, store or date range, or clear the filters.' : 'Import the daily inventory file from Data & Predictions.'}
        to={hasFilters ? undefined : '/data'}
        linkLabel="Go to Data & Predictions"
      />
    )
  } else {
    body = (
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>Date</TableHead>
            <TableHead className={HEAD}>Store</TableHead>
            <TableHead className={HEAD}>Item</TableHead>
            <TableHead className={`${HEAD} text-right`}>Closing stock</TableHead>
            <TableHead className={`${HEAD} text-right`}>Demand</TableHead>
            <TableHead className={`${HEAD} text-right`}>Unmet</TableHead>
            <TableHead className={`${HEAD} text-right`}>On order</TableHead>
            <TableHead className={HEAD}>Stockout</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.date}-${row.store_id}-${row.item_id}`} className="border-border/70">
              <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap">{formatDate(row.date)}</TableCell>
              <TableCell className="px-2 py-2.5 text-sm">
                <span className="block max-w-[220px] truncate" title={storeName(row.store_id)}>
                  {storeName(row.store_id)}
                </span>
                <span className="block text-xs text-muted-foreground">{row.store_id}</span>
              </TableCell>
              <TableCell className="px-2 py-2.5 text-sm">
                <Link to={`/products/${row.item_id}`} className="font-mono font-medium text-foreground hover:text-primary hover:underline">
                  {row.item_id}
                </Link>
              </TableCell>
              <TableCell className={cn(NUM, 'font-semibold', row.closing_qty === 0 ? 'text-danger' : 'text-foreground')}>{formatNumber(row.closing_qty)}</TableCell>
              <TableCell className={NUM}>{formatNumber(row.demand_qty)}</TableCell>
              <TableCell className={cn(NUM, row.unmet_qty > 0 && 'font-medium text-danger')}>{formatNumber(row.unmet_qty)}</TableCell>
              <TableCell className={NUM}>{formatNumber(row.on_order_qty)}</TableCell>
              <TableCell className="px-2 py-2.5">{row.is_stockout ? <ToneBadge label="Stockout" tone="danger" className="px-2" /> : <span className="text-muted-foreground">{EM_DASH}</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Inventory" description="Stock on hand per store and item from the daily inventory records – current stock by default, or a date range for the history.">
        <RunFacts className="mt-3" title="View" icon={latest ? Boxes : History} loading={!rangeInvalid && query.isPending} items={viewFacts} />
      </PageHeader>

      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="min-w-0 flex-1 md:min-w-[14rem]">
              <Label htmlFor="inv-item" className="mb-1.5 text-xs text-muted-foreground">
                Item
              </Label>
              <ProductPicker id="inv-item" value={filters.item_id} onChange={(itemId) => update({ item_id: itemId })} />
            </div>
            <div>
              <Label htmlFor="inv-store" className="mb-1.5 text-xs text-muted-foreground">
                Store
              </Label>
              <Select value={filters.store_id || ALL} onValueChange={(value) => update({ store_id: value })}>
                <SelectTrigger id="inv-store" className="h-9 w-full bg-card md:w-[17rem]">
                  <SelectValue placeholder="All stores" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All stores</SelectItem>
                  {STORES.map((store) => (
                    <SelectItem key={store.store_id} value={store.store_id}>
                      {store.store_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DateRangeFilter id="inv-dates" label="Date range (switches to history)" start={filters.start_date} end={filters.end_date} onChange={update} className="md:w-[22rem]" />
            <SwitchField id="inv-stockout" label="Stockout rows only" checked={stockoutOnly} onCheckedChange={(checked) => update({ stockout_only: checked ? 'true' : '' })} />
            {!latest ? (
              <Button type="button" variant="outline" size="sm" className="h-9 bg-card" onClick={() => update({ start_date: '', end_date: '' })}>
                <Boxes aria-hidden="true" />
                Current stock
              </Button>
            ) : null}
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => update({ item_id: '', store_id: '', stockout_only: '', start_date: '', end_date: '' })}>
                <X aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {rangeInvalid || query.isError
              ? ''
              : query.isPending
                ? 'Loading…'
                : `${formatNumber(total)} store × item row${total === 1 ? '' : 's'}${hasFilters ? ' match' : ''}`}
            {query.isFetching && !query.isPending ? ' · updating…' : ''}
          </p>

          {body}

          {!rangeInvalid && !query.isPending && !query.isError && total > 0 ? (
            <TablePagination total={total} limit={filters.limit} offset={filters.offset} onChange={(next) => update(next, { resetOffset: false })} disabled={query.isFetching} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
