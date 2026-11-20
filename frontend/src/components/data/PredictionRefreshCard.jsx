import { useIsMutating } from '@tanstack/react-query'
import { CircleAlert, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import SectionCard from '@/components/product/SectionCard'
import RefreshResultCard from '@/components/data/RefreshResultCard'
import { usePredictionStatus, useRefreshPredictions } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed-seconds'
import { formatDateTime, formatElapsed, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * "Update predictions" (§7.11 step 2): confirm dialog → POST /predictions/refresh (~70 s) with an elapsed-time
 * indicator and a disabled button → result card. The hook invalidates every query on success (§5.4).
 */
export default function PredictionRefreshCard() {
  const refresh = useRefreshPredictions()
  const status = usePredictionStatus() // shared with the status strip; shows the last completed run
  const importing = useIsMutating({ mutationKey: ['data', 'import'] }) > 0
  const elapsed = useElapsedSeconds(refresh.isPending)
  const last = status.data ?? null

  const start = () =>
    refresh.mutate(undefined, {
      onSuccess: (data) => {
        const step = data.recommendations
        if (step?.status === 'failed') {
          toast.warning('Predictions saved, but recommendations failed', { description: step.error || undefined })
        } else {
          toast.success('Predictions updated', {
            description: `${formatNumber(data.forecast_count)} weekly forecasts · ${formatNumber(data.stockout_count)} stockout risks`,
          })
        }
      },
      onError: (error) => toast.error('Update failed', { description: errorMessage(error) }),
    })

  return (
    <div className={cn('space-y-6', !refresh.isSuccess && 'h-full')}>
      <SectionCard
        icon={RefreshCw}
        title="Step 2 · Update predictions"
        description="Recalculates the forecasts, stockout risks and recommendations from the latest uploaded data."
        className={cn(!refresh.isSuccess && 'h-full')}
        contentClassName="flex flex-1 flex-col gap-4"
      >
        <p className="text-sm text-muted-foreground">
          {last ? `Last updated ${formatDateTime(last.completed_at)}.` : 'Not updated yet.'} Takes about a minute; every page shows the new results afterwards.
        </p>

        <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" className="w-full sm:w-auto" disabled={refresh.isPending || importing}>
                {refresh.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                {refresh.isPending ? 'Updating…' : 'Update predictions'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Update the predictions now?</AlertDialogTitle>
                <AlertDialogDescription>
                  This recalculates the forecasts, stockout risks and recommendations from the latest uploaded data. It takes about a minute, and
                  every page shows the new results afterwards.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={start}>Update now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {refresh.isPending ? (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{formatElapsed(elapsed)}</span> so far · usually about a minute. Please keep this page
              open.
            </p>
          ) : importing ? (
            <p className="text-xs text-muted-foreground">Wait for the upload to finish first.</p>
          ) : null}
        </div>

        {refresh.isError ? (
          <Alert variant="destructive" className="border-danger/30">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription className="break-words">{errorMessage(refresh.error)}</AlertDescription>
          </Alert>
        ) : null}
      </SectionCard>

      {refresh.isSuccess ? <RefreshResultCard result={refresh.data} /> : null}
    </div>
  )
}
