import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, X, Zap } from 'lucide-react'
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
import TablePagination from '@/components/common/TablePagination'
import ToneBadge from '@/components/common/ToneBadge'
import { usePurchaseOrders, useSupplierList } from '@/api/hooks'
import { ALL, useUrlFilters } from '@/hooks/use-url-filters'
import { PO_STATUSES, PO_STATUS_META, enumMeta } from '@/lib/enums'
import { formatDate, formatNumber, formatPKR, isDateRangeInvalid } from '@/lib/format'

const FILTER_KEYS = ['status', 'item_id', 'supplier_id', 'start_date', 'end_date']
const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/**
 * Purchase Orders (`/purchase-orders`, plan §7.10): every purchase-order line, newest order date first, filtered by
 * status, item, supplier and order-date range. Filters and pagination live in the URL (plan §5.4).
 */
export default function PurchaseOrdersPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const rangeInvalid = isDateRangeInvalid(filters.start_date, filters.end_date)
  const query = usePurchaseOrders(
    {
      status: filters.status,
      item_id: filters.item_id,
      supplier_id: filters.supplier_id,
      start_date: filters.start_date,
      end_date: filters.end_date,
      limit: filters.limit,
      offset: filters.offset,
    },
    { placeholderData: (previous) => previous, enabled: !rangeInvalid },
  )
  const suppliers = useSupplierList()
  const supplierRows = useMemo(() => [...(suppliers.data?.items ?? [])].sort((a, b) => a.supplier_id.localeCompare(b.supplier_id)), [suppliers.data])
  const supplierName = useMemo(() => new Map(supplierRows.map((row) => [row.supplier_id, row.supplier_name])), [supplierRows])

  const rows = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const hasFilters = Boolean(filters.status || filters.item_id || filters.supplier_id || filters.start_date || filters.end_date)

  let body
  if (rangeInvalid) {
    body = <EmptyState icon={ClipboardList} title="Fix the order-date range to load purchase orders." />
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
        icon={ClipboardList}
        title={hasFilters ? 'No purchase orders match these filters.' : 'No purchase orders in the database yet.'}
        description={hasFilters ? 'Try another status, item, supplier or date range, or clear the filters.' : 'Import the purchase orders file from Data & Predictions.'}
        to={hasFilters ? undefined : '/data'}
        linkLabel="Go to Data & Predictions"
      />
    )
  } else {
    body = (
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>PO</TableHead>
            <TableHead className={HEAD}>Supplier</TableHead>
            <TableHead className={HEAD}>Item</TableHead>
            <TableHead className={HEAD}>Ordered on</TableHead>
            <TableHead className={HEAD}>Expected</TableHead>
            <TableHead className={`${HEAD} text-right`}>Quantity</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={`${HEAD} text-right`}>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const status = enumMeta(PO_STATUS_META, row.status)
            const name = supplierName.get(row.supplier_id)
            // Accepted quantity is only meaningful once the order was received (open orders carry 0).
            const short = row.status === 'Received' && row.accepted_quantity != null && row.accepted_quantity !== row.ordered_quantity
            return (
              <TableRow key={row.purchase_order_id} className="border-border/70">
                <TableCell className="px-2 py-2.5 font-mono text-sm font-medium text-foreground">{row.purchase_order_id}</TableCell>
                <TableCell className="px-2 py-2.5 text-sm">
                  <Link to={`/suppliers/${row.supplier_id}`} className="block max-w-[220px] truncate font-medium text-foreground hover:text-primary hover:underline" title={name ?? row.supplier_id}>
                    {name ?? row.supplier_id}
                  </Link>
                  {name ? <span className="block text-xs text-muted-foreground">{row.supplier_id}</span> : null}
                </TableCell>
                <TableCell className="px-2 py-2.5 text-sm">
                  <Link to={`/products/${row.item_id}`} className="font-mono text-foreground hover:text-primary hover:underline">
                    {row.item_id}
                  </Link>
                </TableCell>
                <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap">{formatDate(row.order_date)}</TableCell>
                <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap">
                  {formatDate(row.expected_delivery_date)}
                  {row.receipt_date ? <span className="block text-xs text-muted-foreground">received {formatDate(row.receipt_date)}</span> : null}
                </TableCell>
                <TableCell className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums">
                  {formatNumber(row.ordered_quantity)}
                  {short ? <span className="block text-xs font-normal text-danger">accepted {formatNumber(row.accepted_quantity)}</span> : null}
                </TableCell>
                <TableCell className="px-2 py-2.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <ToneBadge label={status.label} tone={status.tone} icon={null} className="px-2" />
                    {row.is_emergency ? <ToneBadge label="Emergency" tone="danger" icon={Zap} className="px-2" /> : null}
                  </div>
                </TableCell>
                <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums whitespace-nowrap">{formatPKR(row.line_amount_pkr)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase Orders" description="Open and received purchase-order lines by supplier, item and order date. Newest first." />

      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div>
              <Label htmlFor="po-status" className="mb-1.5 text-xs text-muted-foreground">
                Status
              </Label>
              <Select value={filters.status || ALL} onValueChange={(value) => update({ status: value })}>
                <SelectTrigger id="po-status" className="h-9 w-full bg-card md:w-[10rem]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {PO_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {PO_STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="po-supplier" className="mb-1.5 text-xs text-muted-foreground">
                Supplier
              </Label>
              <Select value={filters.supplier_id || ALL} onValueChange={(value) => update({ supplier_id: value })}>
                <SelectTrigger id="po-supplier" className="h-9 w-full bg-card md:w-[17rem]">
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All suppliers</SelectItem>
                  {filters.supplier_id && !supplierName.has(filters.supplier_id) ? <SelectItem value={filters.supplier_id}>{filters.supplier_id}</SelectItem> : null}
                  {supplierRows.map((row) => (
                    <SelectItem key={row.supplier_id} value={row.supplier_id}>
                      {row.supplier_name} · {row.supplier_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 flex-1 md:min-w-[14rem]">
              <Label htmlFor="po-item" className="mb-1.5 text-xs text-muted-foreground">
                Item
              </Label>
              <ProductPicker id="po-item" value={filters.item_id} onChange={(itemId) => update({ item_id: itemId })} />
            </div>
            <DateRangeFilter id="po-dates" label="Order date" start={filters.start_date} end={filters.end_date} onChange={update} className="md:w-[22rem]" />
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => update({ status: '', item_id: '', supplier_id: '', start_date: '', end_date: '' })}>
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
                : `${formatNumber(total)} purchase order${total === 1 ? '' : 's'}${hasFilters ? ' match' : ''}`}
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
