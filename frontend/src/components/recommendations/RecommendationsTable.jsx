import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ToneBadge, { ActionBadge, PriorityBadge } from '@/components/common/ToneBadge'
import RecommendationDetails from './RecommendationDetails'
import { RECOMMENDATION_STATUS_META, enumMeta, storeName } from '@/lib/enums'
import { formatDateTime } from '@/lib/format'
import { actionShort } from '@/lib/recommendation-text'
import { cn } from '@/lib/utils'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'
const COLUMN_COUNT = 6

/**
 * Recommendations list (plan §7.3, officer view): priority, product, action with its short form, store and status.
 * Rows arrive most urgent first (the API orders by priority, then stockout chance). A click expands the row into
 * the detail panel, where an officer decides; reorder points, inventory position and model inputs are not shown.
 * @param {{ rows: import('@/api/shapes').RecommendationRow[], isLatestSet?: boolean }} props
 */
export default function RecommendationsTable({ rows, isLatestSet = true }) {
  const [expanded, setExpanded] = useState(() => new Set())
  // The table scrolls horizontally on small screens; the expanded panel is pinned to the visible width instead.
  const containerRef = useRef(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const toggle = (id) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Clicking anywhere on a row (except its links and buttons) toggles the details.
  const onRowClick = (event, id) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return
    toggle(id)
  }

  return (
    <div ref={containerRef} className="min-w-0">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={`${HEAD} w-10`}>
              <span className="sr-only">Details</span>
            </TableHead>
            <TableHead className={HEAD}>Priority</TableHead>
            <TableHead className={HEAD}>Product</TableHead>
            <TableHead className={HEAD}>Action</TableHead>
            <TableHead className={HEAD}>Store</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const open = expanded.has(row.id)
            const status = enumMeta(RECOMMENDATION_STATUS_META, row.status)
            const detailsId = `recommendation-${row.id}-details`
            return (
              <Fragment key={row.id}>
                <TableRow className={cn('cursor-pointer border-border/70', open && 'border-b-0 bg-muted/20')} onClick={(event) => onRowClick(event, row.id)}>
                  <TableCell className="px-1 py-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={open}
                      aria-controls={open ? detailsId : undefined}
                      aria-label={open ? 'Hide details' : 'Show details'}
                      className="text-muted-foreground"
                      onClick={() => toggle(row.id)}
                    >
                      <ChevronDown aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
                    </Button>
                  </TableCell>
                  <TableCell className="px-2 py-3">
                    <PriorityBadge priority={row.priority} className="px-2" />
                  </TableCell>
                  <TableCell className="w-full min-w-[220px] max-w-0 px-2 py-3">
                    <Link to={`/products/${encodeURIComponent(row.product_id)}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={row.product_name}>
                      {row.product_name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{row.product_id}</span>
                  </TableCell>
                  <TableCell className="px-2 py-3">
                    <ActionBadge action={row.action} className="px-2" />
                    <span className="mt-1 block text-xs text-muted-foreground">{actionShort(row)}</span>
                  </TableCell>
                  <TableCell className="px-2 py-3 text-sm">
                    {row.store_id ? (
                      <span className="block max-w-[200px] truncate" title={row.store_name ?? undefined}>
                        {row.store_name ?? storeName(row.store_id)}
                      </span>
                    ) : (
                      // store_id is null for every non-transfer row: the action applies to the central store.
                      <span className="block text-muted-foreground">Central store</span>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-3">
                    <ToneBadge label={status.label} tone={status.tone} icon={null} className="px-2" />
                    {row.decision ? (
                      <span className="mt-1 block max-w-[160px] truncate text-xs text-muted-foreground" title={`${row.decision.decided_by_name}, ${formatDateTime(row.decision.decided_at)}`}>
                        {row.decision.decided_by_name}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow id={detailsId} className="border-border/70 bg-muted/20 hover:bg-muted/20">
                    <TableCell colSpan={COLUMN_COUNT} className="p-0 whitespace-normal">
                      <div className="sticky left-0 px-4 pt-1 pb-5 sm:px-6" style={viewportWidth ? { width: viewportWidth } : undefined}>
                        <RecommendationDetails row={row} isLatestSet={isLatestSet} />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
