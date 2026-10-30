import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber } from '@/lib/format'
import { PAGE_SIZES } from '@/lib/enums'

/**
 * Offset/limit pagination footer for API pages (plan §7.2: 25/50/100).
 * @param {{ total: number, limit: number, offset: number, onChange: (next: { limit: number, offset: number }) => void, disabled?: boolean }} props
 */
export default function TablePagination({ total = 0, limit, offset, onChange, disabled = false }) {
  const start = total === 0 ? 0 : offset + 1
  const end = Math.min(offset + limit, total)
  const hasPrev = offset > 0
  const hasNext = offset + limit < total

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <Select value={String(limit)} onValueChange={(value) => onChange({ limit: Number(value), offset: 0 })} disabled={disabled}>
          <SelectTrigger size="sm" aria-label="Rows per page" className="w-[4.5rem] bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <span className="tabular-nums">
          {formatNumber(start)}–{formatNumber(end)} of {formatNumber(total)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={disabled || !hasPrev}
            onClick={() => onChange({ limit, offset: Math.max(0, offset - limit) })}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={disabled || !hasNext}
            onClick={() => onChange({ limit, offset: offset + limit })}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
