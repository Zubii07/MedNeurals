import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * "Predictions updated {latest_prediction_timestamp}" + a reload icon that re-fetches every query
 * (it never runs the models – plan §4).
 *
 * @param {{ timestamp: string | null | undefined, loading: boolean }} props
 */
export default function LastUpdatedCard({ timestamp, loading }) {
  const queryClient = useQueryClient()
  const fetching = useIsFetching() > 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-[0_1px_2px_rgb(15_42_55/0.04)]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Clock className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="text-[11px] text-muted-foreground">Predictions updated</p>
        {loading ? <Skeleton className="mt-1 h-4 w-36" /> : <p className="truncate text-sm font-medium text-foreground">{timestamp ? formatDateTime(timestamp) : 'No prediction run yet'}</p>}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Reload dashboard data"
            className="ml-1 text-primary hover:bg-accent"
            disabled={fetching}
            onClick={() => queryClient.invalidateQueries()}
          >
            <RefreshCw className={cn('size-4', fetching && 'animate-spin')} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reload data (does not run the models)</TooltipContent>
      </Tooltip>
    </div>
  )
}
