import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import ToneBadge, { ActionBadge, PriorityBadge } from '@/components/common/ToneBadge'
import RecommendationDetails from './RecommendationDetails'
import { RECOMMENDATION_STATUS_META, enumMeta, storeName } from '@/lib/enums'
import { EM_DASH, formatNumber, formatQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'
const COLUMN_COUNT = 9

/**
 * Quantity cell: the number that matters for the action, with a short cue underneath so it is not read as
 * "buy this much" – purchase quantity "to buy", transfer quantity "to move", the on-order quantity
 * "on order, chase it" for EXPEDITE_PO rows (no new quantity is recommended), and nothing for NONE rows.
 */
function quantityFor(row) {
  if (row.action === 'PURCHASE') return { value: formatQuantity(row.recommended_purchase_quantity, row.unit), cue: 'to buy' }
  if (row.action === 'TRANSFER') return { value: formatQuantity(row.transfer_quantity, row.unit), cue: 'to move' }
  if (row.action === 'EXPEDITE_PO') {
    const onOrder = row.details?.on_order_qty
    return onOrder != null ? { value: formatQuantity(onOrder, row.unit), cue: 'on order, chase it' } : { value: EM_DASH }
  }
  return null
}

function QuantityCell({ row }) {
  const quantity = quantityFor(row)
  if (!quantity) return null
  return (
    <>
      <span className="block">{quantity.value}</span>
      {quantity.cue ? <span className="block text-xs font-normal text-muted-foreground">{quantity.cue}</span> : null}
    </>
  )
}

/**
 * Recommendations table (plan §7.3): priority, item, action, store ("Central store" unless a transfer), quantity, reorder point,
 * inventory position, status and an expand chevron that reveals the reason and `details`.
 * @param {{ rows: import('@/api/shapes').RecommendationRow[] }} props
 */
export default function RecommendationsTable({ rows }) {
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
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={`${HEAD} w-10`}>
              <span className="sr-only">Details</span>
            </TableHead>
            <TableHead className={HEAD}>Priority</TableHead>
            <TableHead className={HEAD}>Item</TableHead>
            <TableHead className={HEAD}>Action</TableHead>
            <TableHead className={HEAD}>Store</TableHead>
            <TableHead className={`${HEAD} text-right`}>Quantity</TableHead>
            <TableHead className={`${HEAD} text-right`}>Reorder point</TableHead>
            <TableHead className={`${HEAD} text-right`}>Inventory position</TableHead>
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
                <TableRow className={cn('cursor-pointer border-border/70', open && 'border-b-0')} onClick={(event) => onRowClick(event, row.id)}>
                  <TableCell className="px-1 py-2.5">
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
                  <TableCell className="px-2 py-2.5">
                    <PriorityBadge priority={row.priority} className="px-2" />
                  </TableCell>
                  <TableCell className="w-full min-w-[220px] max-w-0 px-2 py-2.5">
                    <Link to={`/products/${row.product_id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={row.product_name}>
                      {row.product_name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{row.product_id}</span>
                  </TableCell>
                  <TableCell className="px-2 py-2.5">
                    <ActionBadge action={row.action} className="px-2" />
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-sm">
                    {row.store_id ? (
                      <>
                        <span className="block max-w-[180px] truncate" title={row.store_name ?? undefined}>
                          {row.store_name ?? storeName(row.store_id)}
                        </span>
                        <span className="block text-xs text-muted-foreground">{row.store_id}</span>
                      </>
                    ) : (
                      // store_id is null for every non-transfer row: the action applies to the central store.
                      <span className="block text-muted-foreground">Central store</span>
                    )}
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums">
                    <QuantityCell row={row} />
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums">{formatNumber(row.reorder_point, { maxDigits: 0 })}</TableCell>
                  <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums">{formatNumber(row.inventory_position)}</TableCell>
                  <TableCell className="px-2 py-2.5">
                    <ToneBadge label={status.label} tone={status.tone} icon={null} className="px-2" />
                  </TableCell>
                </TableRow>
                {open ? (
                  <TableRow id={detailsId} className="border-border/70 bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={COLUMN_COUNT} className="p-0 whitespace-normal">
                      <div className="sticky left-0 px-4 py-4 sm:px-6" style={viewportWidth ? { width: viewportWidth } : undefined}>
                        <RecommendationDetails row={row} />
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
