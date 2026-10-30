import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import WidgetCard from '@/components/common/WidgetCard'
import { RiskBadge } from '@/components/common/ToneBadge'
import { formatPercent } from '@/lib/format'
import { storeShortName } from '@/lib/enums'

const HEAD_CLASSES = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-3 pt-1">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-28" />
        </div>
      ))}
    </div>
  )
}

/**
 * "Stockout Risk Centre" widget: top 5 store×item rows by probability (plan §4).
 * Columns: Item (name + id), Store, Probability, Risk, Action "View analysis".
 *
 * @param {{ query: import('@tanstack/react-query').UseQueryResult<import('@/api/shapes').StockoutRiskPage>, hasRun: boolean }} props
 */
export default function StockoutRiskTable({ query, hasRun }) {
  const { data, isPending, isError, error, refetch, isFetching } = query
  const rows = data?.items ?? []

  let body
  if (!hasRun || (isError && error?.status === 404)) {
    body = <EmptyState icon={ShieldCheck} title="No stockout predictions yet." description="Run a prediction refresh to see store × item risks." to="/data" linkLabel="Go to Data & Predictions" compact />
  } else if (isPending) {
    body = <TableSkeleton />
  } else if (isError) {
    body = <ErrorState error={error} onRetry={refetch} retrying={isFetching} compact />
  } else if (rows.length === 0) {
    body = <EmptyState icon={ShieldCheck} title="No store × item risks in the latest run." compact />
  } else {
    body = (
      <Table className="h-full">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD_CLASSES}>Item</TableHead>
            <TableHead className={HEAD_CLASSES}>Store</TableHead>
            <TableHead className={`${HEAD_CLASSES} text-right`}>Probability</TableHead>
            <TableHead className={HEAD_CLASSES}>Risk level</TableHead>
            <TableHead className={`${HEAD_CLASSES} text-right`}>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.item_id}-${row.store_id}`} className="border-border/70">
              <TableCell className="w-full min-w-[128px] max-w-0 px-2 py-3.5">
                <Link to={`/products/${row.item_id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={row.item_name}>
                  {row.item_name}
                </Link>
                <span className="block text-xs text-muted-foreground">{row.item_id}</span>
              </TableCell>
              <TableCell className="px-2 py-3.5 text-sm text-foreground" title={row.store_name}>
                <span className="block max-w-[80px] truncate">{storeShortName(row.store_id)}</span>
                <span className="block text-xs text-muted-foreground">{row.store_id}</span>
              </TableCell>
              <TableCell className="px-2 py-3.5 text-right text-sm font-semibold tabular-nums text-foreground">{formatPercent(row.probability)}</TableCell>
              <TableCell className="px-2 py-3.5">
                <RiskBadge level={row.risk_level} className="px-2" />
              </TableCell>
              <TableCell className="px-2 py-3.5 text-right">
                <Button asChild size="sm" variant={row.risk_level === 'URGENT' ? 'default' : 'outline'} className="rounded-lg px-1.5">
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
    <WidgetCard
      title="Stockout Risk Centre"
      description={
        data?.total != null && hasRun
          ? `Highest stockout probability within 14 days · ${data.total.toLocaleString()} store × item rows predicted`
          : 'Highest stockout probability within 14 days, per store × item.'
      }
      to="/stockout-risks"
      contentClassName="px-3 [&>[data-slot=table-container]]:flex-1"
    >
      {body}
    </WidgetCard>
  )
}
