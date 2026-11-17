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
import StatTile from '@/components/common/StatTile'
import SectionCard from '@/components/product/SectionCard'
import RefreshResultCard from '@/components/data/RefreshResultCard'
import { usePredictionStatus, useRefreshPredictions } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed-seconds'
import { formatDate, formatDateTime, formatElapsed, formatNumber, runLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * "Run prediction refresh" (§7.11 step 2): confirm dialog → POST /predictions/refresh (~70 s) with an elapsed-time
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
          toast.success('Prediction refresh completed', {
            description: `Run ${runLabel(data.stockout?.model_run_id)} · ${formatNumber(data.forecast_count)} forecasts · ${formatNumber(data.stockout_count)} stockout predictions`,
          })
        }
      },
      onError: (error) => toast.error('Prediction refresh failed', { description: errorMessage(error) }),
    })

  return (
    <div className={cn('space-y-6', !refresh.isSuccess && 'h-full')}>
      <SectionCard
        icon={RefreshCw}
        title="Run prediction refresh"
        description="Runs both ML models on the latest inventory date and generates recommendations."
        className={cn(!refresh.isSuccess && 'h-full')}
        contentClassName="flex flex-1 flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Last completed" value={last ? formatDateTime(last.completed_at) : 'No run yet'} className="[&>div:nth-child(2)]:text-sm" />
          <StatTile
            label="Last run"
            value={last ? `${runLabel(last.demand_forecast?.model_run_id)} · ${runLabel(last.stockout?.model_run_id)}` : '—'}
            hint={last ? `cutoff ${formatDate(last.data_cutoff_date)}` : undefined}
            className="[&>div:nth-child(2)]:text-sm"
          />
        </div>

        <p className="text-xs text-muted-foreground">Takes about a minute and writes to the database. Earlier runs are kept; every page reloads afterwards.</p>

        <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" className="w-full sm:w-auto" disabled={refresh.isPending || importing}>
                {refresh.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                {refresh.isPending ? 'Running…' : 'Run prediction refresh'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Run prediction refresh?</AlertDialogTitle>
                <AlertDialogDescription>
                  This runs both ML models on the latest data and takes about a minute. It writes new prediction runs and recommendations to the
                  database.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={start}>Run refresh</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {refresh.isPending ? (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{formatElapsed(elapsed)}</span> elapsed · usually about 70 seconds. Please keep this
              page open.
            </p>
          ) : importing ? (
            <p className="text-xs text-muted-foreground">Wait for the data import to finish before running a refresh.</p>
          ) : null}
        </div>

        {refresh.isError ? (
          <Alert variant="destructive" className="border-danger/30">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Prediction refresh failed</AlertTitle>
            <AlertDescription className="break-words">{errorMessage(refresh.error)}</AlertDescription>
          </Alert>
        ) : null}
      </SectionCard>

      {refresh.isSuccess ? <RefreshResultCard result={refresh.data} /> : null}
    </div>
  )
}
