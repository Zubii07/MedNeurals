import { CircleAlert, CircleCheck, Loader2, RotateCw, Sparkles, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import RecommendationSummaryPanel from '@/components/data/RecommendationSummaryPanel'
import { useRefreshRecommendations } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useElapsedSeconds } from '@/hooks/use-elapsed-seconds'
import { formatElapsed, formatNumber } from '@/lib/format'

/**
 * The recommendation step of a prediction run (§6.7 / §6.9):
 * - `generated` → the summary;
 * - `failed`    → the backend error and a "Retry recommendations" button;
 * - `missing`   → (dashboard's missing-set case) a "Generate recommendations" button.
 * Both buttons call `POST /recommendations/refresh?model_run_id=` for the given stockout run – nothing is re-predicted.
 * Keep this component mounted while its parent re-renders so a finished retry stays visible.
 *
 * @param {{ step: import('@/api/shapes').RecommendationStep | { status: 'missing' } | null, modelRunId: number | undefined }} props
 */
export default function RecommendationStepPanel({ step, modelRunId }) {
  const retry = useRefreshRecommendations()
  const elapsed = useElapsedSeconds(retry.isPending)

  if (retry.isSuccess) {
    return (
      <div className="space-y-3">
        <p className="flex items-start gap-2 text-sm font-medium text-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Recommendations {retry.data.created ? 'generated' : 'were already there'}.
        </p>
        <RecommendationSummaryPanel summary={retry.data} />
      </div>
    )
  }

  if (!step) return null
  if (step.status === 'generated' && step.summary) return <RecommendationSummaryPanel summary={step.summary} />

  const failed = step.status === 'failed'
  const missing = step.status === 'missing'
  if (!failed && !missing) return null

  const generate = () =>
    retry.mutate(
      { model_run_id: modelRunId },
      {
        onSuccess: (summary) =>
          toast.success(summary.created ? 'Recommendations generated' : 'Recommendation set already existed', {
            description: `${formatNumber(summary.row_count)} recommendations for ${formatNumber(summary.item_count)} products`,
          }),
        onError: (error) => toast.error('Recommendations failed', { description: errorMessage(error) }),
      },
    )

  return (
    <div className="space-y-3">
      {failed ? (
        <Alert variant="destructive" className="border-danger/30">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Recommendation generation failed</AlertTitle>
          <AlertDescription className="break-words">{step.error || 'The backend did not return an error message.'}</AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-warning/40 bg-warning-bg text-[#78350f] *:data-[slot=alert-description]:text-[#92400e]">
          <TriangleAlert className="text-[#b45309]" aria-hidden="true" />
          <AlertTitle>The latest predictions have no recommendations yet.</AlertTitle>
          <AlertDescription>Generate them from the saved predictions. Nothing is predicted again.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        <Button type="button" size="sm" variant="outline" className="bg-card" disabled={retry.isPending || modelRunId == null} onClick={generate}>
          {retry.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : failed ? <RotateCw aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {retry.isPending ? `Generating… ${formatElapsed(elapsed)}` : failed ? 'Retry recommendations' : 'Generate recommendations'}
        </Button>
        {retry.isPending ? (
          <span aria-live="polite" className="text-xs text-muted-foreground">
            Usually a few seconds. Please keep this page open.
          </span>
        ) : null}
      </div>

      {retry.isError ? (
        <Alert variant="destructive" className="border-danger/30">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Recommendations failed</AlertTitle>
          <AlertDescription className="break-words">{errorMessage(retry.error)}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
