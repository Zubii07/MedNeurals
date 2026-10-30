import { CircleAlert, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/api/client'
import { cn } from '@/lib/utils'

/**
 * Error state (plan §7.4): the backend `detail` text (or the network message) and a Retry button.
 * @param {{ error: unknown, onRetry?: () => void, retrying?: boolean, className?: string, compact?: boolean }} props
 */
export default function ErrorState({ error, onRetry, retrying = false, className, compact = false }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-6' : 'gap-3 py-10', className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-danger-bg text-danger">
        <CircleAlert className="size-5" aria-hidden="true" />
      </span>
      <p className="max-w-sm text-sm font-medium text-foreground">{errorMessage(error)}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
          <RotateCw className={cn(retrying && 'animate-spin')} aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
