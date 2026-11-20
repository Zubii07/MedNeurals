import { CircleCheck, Database, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/common/ErrorState'
import RecommendationStepPanel from '@/components/data/RecommendationStepPanel'
import { useDashboardSummary, usePredictionStatus } from '@/api/hooks'
import { isNoPredictionRunError } from '@/api/client'
import { EM_DASH, formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const TILE = {
  success: 'bg-success-bg text-[#047857]',
  warning: 'bg-warning-bg text-[#b45309]',
  neutral: 'bg-muted text-muted-foreground',
}

/** Passed to the step panel when the dashboard summary says the latest run has no recommendation set. */
const MISSING_STEP = { status: 'missing', summary: null, error: null }

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{children}</dd>
    </div>
  )
}

/**
 * One status card for Data & Predictions (§7.11 step 1): a headline that says whether anything needs doing, and
 * three facts – data through, predictions updated, recommendations. When recommendations are missing, the step
 * panel underneath offers "Generate recommendations".
 */
export default function StatusStrip() {
  const status = usePredictionStatus()
  const summary = useDashboardSummary()

  const noRun = status.isError && isNoPredictionRunError(status.error)
  const run = status.data ?? null
  const set = summary.data?.recommendation_set
  const latestData = summary.data?.latest_data_date ?? null
  const dataNewer = Boolean(run && latestData && latestData > run.data_cutoff_date)
  const setMissing = Boolean(run) && set?.status === 'missing'

  if (status.isPending || summary.isPending) {
    return <Skeleton className="h-[6.5rem] rounded-xl" />
  }

  if (status.isError && !noRun) {
    return (
      <Card>
        <ErrorState error={status.error} onRetry={status.refetch} retrying={status.isFetching} compact />
      </Card>
    )
  }

  let tone = 'success'
  let Icon = CircleCheck
  let headline = 'Everything is up to date'
  let detail = latestData ? `The predictions use all data through ${formatDate(latestData)}.` : 'The predictions use the latest data.'
  if (!run) {
    tone = 'neutral'
    Icon = Database
    headline = 'No predictions yet'
    detail = 'Upload the data files (step 1), then update the predictions (step 2).'
  } else if (dataNewer) {
    tone = 'warning'
    Icon = TriangleAlert
    headline = 'New data since the last update'
    detail = `Data now goes through ${formatDate(latestData)}, but the predictions still use data through ${formatDate(run.data_cutoff_date)}. Update the predictions (step 2).`
  } else if (setMissing) {
    tone = 'warning'
    Icon = TriangleAlert
    headline = 'Recommendations are missing'
    detail = 'The latest predictions have no recommendations yet. Generate them below.'
  }

  return (
    <div className="space-y-4">
      <Card className={cn('px-5 py-5 [--card-spacing:0]', status.isFetching && 'opacity-70 transition-opacity')}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TILE[tone])}>
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">{headline}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-x-6 gap-y-1">
            <Fact label="Data through">{summary.isError ? EM_DASH : formatDate(latestData)}</Fact>
            <Fact label="Predictions updated">{run ? formatDateTime(run.completed_at) : 'Never'}</Fact>
            <Fact label="Recommendations">{!run ? EM_DASH : set?.status === 'current' ? 'Ready' : 'Missing'}</Fact>
          </dl>
        </div>
      </Card>

      {/* Always mounted so a finished "Generate recommendations" stays visible after the set turns current. */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(15_42_55/0.04)] empty:hidden">
        <RecommendationStepPanel step={setMissing ? MISSING_STEP : null} modelRunId={run?.stockout?.model_run_id} />
      </div>
    </div>
  )
}
