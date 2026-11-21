import { Link } from 'react-router-dom'
import { ArrowRight, Truck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import PageHeader from '@/components/common/PageHeader'
import ProductPicker from '@/components/common/ProductPicker'
import SwitchField from '@/components/common/SwitchField'
import TablePagination from '@/components/common/TablePagination'
import ToneBadge from '@/components/common/ToneBadge'
import { useSuppliers } from '@/api/hooks'
import { useUrlFilters } from '@/hooks/use-url-filters'
import { EM_DASH, formatNumber, formatPaymentTerms } from '@/lib/format'

const FILTER_KEYS = ['item_id', 'active_only']
const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/** Reliability class as stored in the supplier master (free text; unknown values fall back to neutral). */
const RELIABILITY_TONE = { High: 'success', Medium: 'warning', Low: 'danger' }

/**
 * Suppliers (`/suppliers`, plan §7.9): the supplier master with an "active only" toggle and an item filter
 * (suppliers linked to that item). Each row opens the supplier's performance page.
 */
export default function SuppliersPage() {
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const activeOnly = filters.active_only === 'true'
  const query = useSuppliers(
    { item_id: filters.item_id, active_only: activeOnly || undefined, limit: filters.limit, offset: filters.offset },
    { placeholderData: (previous) => previous },
  )

  const rows = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const hasFilters = Boolean(filters.item_id || activeOnly)

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
        icon={Truck}
        title={filters.item_id ? 'No suppliers are linked to this item.' : activeOnly ? 'No active suppliers.' : 'No suppliers in the database yet.'}
        description={hasFilters ? 'Clear the filters to see every supplier.' : 'Import the suppliers file from Data & Predictions.'}
        to={hasFilters ? undefined : '/data'}
        linkLabel="Go to Data & Predictions"
      />
    )
  } else {
    body = (
      <Table className="min-w-[880px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>Supplier</TableHead>
            <TableHead className={HEAD}>Type</TableHead>
            <TableHead className={HEAD}>Reliability</TableHead>
            <TableHead className={`${HEAD} text-right`}>Typical lead time</TableHead>
            <TableHead className={HEAD}>Payment terms</TableHead>
            <TableHead className={HEAD}>Active</TableHead>
            <TableHead className={`${HEAD} text-right`}>
              <span className="sr-only">Performance</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.supplier_id} className="border-border/70">
              <TableCell className="w-full min-w-[220px] max-w-0 px-2 py-2.5">
                <Link to={`/suppliers/${row.supplier_id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={row.supplier_name}>
                  {row.supplier_name}
                </Link>
                <span className="block text-xs text-muted-foreground">{row.supplier_id}</span>
              </TableCell>
              <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap">{row.supplier_type ?? EM_DASH}</TableCell>
              <TableCell className="px-2 py-2.5">
                {row.reliability_class ? <ToneBadge label={row.reliability_class} tone={RELIABILITY_TONE[row.reliability_class] ?? 'neutral'} icon={null} className="px-2" /> : <span className="text-muted-foreground">{EM_DASH}</span>}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums whitespace-nowrap">
                {row.typical_lead_time_days != null ? `${formatNumber(row.typical_lead_time_days)} days` : EM_DASH}
                {row.lead_time_variability ? <span className="block text-xs font-normal text-muted-foreground">{row.lead_time_variability} variability</span> : null}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-sm whitespace-nowrap">{formatPaymentTerms(row.payment_terms)}</TableCell>
              <TableCell className="px-2 py-2.5">
                {row.active_flag ? <ToneBadge label="Active" tone="success" icon={null} className="px-2" /> : <ToneBadge label="Inactive" tone="neutral" icon={null} className="px-2" />}
              </TableCell>
              <TableCell className="px-2 py-2.5 text-right">
                <Button asChild size="sm" variant="outline" className="rounded-lg">
                  <Link to={`/suppliers/${row.supplier_id}`}>
                    Performance
                    <ArrowRight aria-hidden="true" />
                  </Link>
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
      <PageHeader title="Suppliers" description="Your suppliers and the delivery time agreed in each contract. Open one to see how long deliveries really take and how often they arrive on time and complete." />

      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="min-w-0 flex-1 md:min-w-[16rem] md:max-w-[26rem]">
              <Label htmlFor="sup-item" className="mb-1.5 text-xs text-muted-foreground">
                Supplies item
              </Label>
              <ProductPicker id="sup-item" value={filters.item_id} onChange={(itemId) => update({ item_id: itemId })} />
            </div>
            <SwitchField id="sup-active" label="Active suppliers only" checked={activeOnly} onCheckedChange={(checked) => update({ active_only: checked ? 'true' : '' })} />
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => update({ item_id: '', active_only: '' })}>
                <X aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {query.isPending ? 'Loading…' : query.isError ? '' : `${formatNumber(total)} supplier${total === 1 ? '' : 's'}${hasFilters ? ' match' : ''}`}
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
