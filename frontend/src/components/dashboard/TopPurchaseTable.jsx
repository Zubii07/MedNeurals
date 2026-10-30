import { Link } from 'react-router-dom'
import { ShoppingCart } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import WidgetCard from '@/components/common/WidgetCard'
import { PriorityBadge } from '@/components/common/ToneBadge'
import { formatQuantity, truncate } from '@/lib/format'

const HEAD_CLASSES = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/**
 * "Top purchase recommendations" widget: first 5 PURCHASE rows (plan §4).
 * Columns: Item, Quantity, Supplier, Priority, Reason. No estimated cost (not stored).
 *
 * @param {{ query: import('@tanstack/react-query').UseQueryResult<import('@/api/shapes').RecommendationPage>, setStatus: 'current' | 'missing' | null, hasRun: boolean }} props
 */
export default function TopPurchaseTable({ query, setStatus, hasRun }) {
  const { data, isPending, isError, error, refetch, isFetching } = query
  const rows = data?.items ?? []

  let body
  if (!hasRun || setStatus === 'missing' || (isError && error?.status === 404)) {
    body = (
      <EmptyState
        icon={ShoppingCart}
        title={setStatus === 'missing' ? 'Recommendations for the latest run are missing.' : 'No recommendations yet.'}
        description={setStatus === 'missing' ? 'Generate them from Data & Predictions.' : 'Run a prediction refresh to generate recommendations.'}
        to="/data"
        linkLabel="Go to Data & Predictions"
        compact
      />
    )
  } else if (isPending) {
    body = (
      <div className="space-y-3 pt-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    )
  } else if (isError) {
    body = <ErrorState error={error} onRetry={refetch} retrying={isFetching} compact />
  } else if (rows.length === 0) {
    body = <EmptyState icon={ShoppingCart} title="No purchase recommendations in the current set." to="/recommendations" linkLabel="See all recommendations" compact />
  } else {
    body = (
      <Table className="h-full min-w-[500px] table-fixed">
        <colgroup>
          <col style={{ width: '30%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '19%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '22%' }} />
        </colgroup>
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD_CLASSES}>Item</TableHead>
            <TableHead className={`${HEAD_CLASSES} text-right`}>Quantity</TableHead>
            <TableHead className={HEAD_CLASSES}>Supplier</TableHead>
            <TableHead className={HEAD_CLASSES}>Priority</TableHead>
            <TableHead className={HEAD_CLASSES}>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="border-border/70">
              <TableCell className="px-2 py-3.5">
                <Link to={`/products/${row.product_id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={row.product_name}>
                  {row.product_name}
                </Link>
                <span className="block text-xs text-muted-foreground">{row.product_id}</span>
              </TableCell>
              <TableCell className="truncate px-2 py-3.5 text-right text-sm font-semibold tabular-nums text-foreground">
                {formatQuantity(row.recommended_purchase_quantity, row.unit)}
              </TableCell>
              <TableCell className="truncate px-2 py-3.5 text-sm text-foreground" title={row.details?.supplier_name ?? undefined}>
                {row.details?.supplier_name ?? '—'}
              </TableCell>
              <TableCell className="px-2 py-3.5">
                <PriorityBadge priority={row.priority} className="px-2" />
              </TableCell>
              <TableCell className="px-2 py-3.5 text-xs text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="block cursor-help truncate">{truncate(row.reason, 70)}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm whitespace-normal">
                    {row.reason}
                  </TooltipContent>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <WidgetCard
      title="Top purchase recommendations"
      description="Highest-priority PURCHASE advice from the rule engine (quantity, supplier, reason)."
      to="/recommendations?action=PURCHASE"
      contentClassName="px-3 [&>[data-slot=table-container]]:flex-1"
    >
      {body}
    </WidgetCard>
  )
}
