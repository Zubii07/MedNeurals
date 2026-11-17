import { Activity, ClipboardList, Cpu, Database } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import ErrorState from '@/components/common/ErrorState'
import RecommendationStepPanel from '@/components/data/RecommendationStepPanel'
import { useDashboardSummary, usePredictionStatus } from '@/api/hooks'
import { isNoPredictionRunError } from '@/api/client'
import { EM_DASH, formatDate, formatDateTime, formatNumber, runLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

const TILE = {
  primary: 'bg-accent text-primary',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-[#047857]',
  warning: 'bg-warning-bg text-[#b45309]',
  violet: 'bg-violet-bg text-violet',
  neutral: 'bg-muted text-muted-foreground',
}

/** Passed to the step panel when the dashboard summary says the latest run has no recommendation set. */
const MISSING_STEP = { status: 'missing', summary: null, error: null }

/** KPI-style tile without a link: icon tile, title, big value, caption (same look as the supplier KPIs). */
function MetricCard({ icon: Icon, tone = 'primary', title, value, caption, muted = false, warn = false }) {
  return (
    <Card className="gap-0 py-5 [--card-spacing:--spacing(4)]">
      <div className="flex items-center gap-3 px-4">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TILE[tone] ?? TILE.primary)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="text-[13px] font-semibold leading-snug text-foreground">{title}</h3>
      </div>
      <div className="mt-4 px-4">
        <div className={cn('leading-none font-semibold tracking-tight', muted ? 'text-lg text-muted-foreground' : 'text-[1.6rem] text-foreground')}>{value}</div>
        {caption ? <div className={cn('mt-2 text-xs', warn ? 'font-medium text-[#b45309]' : 'text-muted-foreground')}>{caption}</div> : null}
      </div>
    </Card>
  )
}

function joinFacts(parts) {
  return parts.filter(Boolean).join(' · ')
}

/**
 * Status strip for Data & Predictions (§7.11 step 1): latest data date, the latest prediction run
 * (GET /predictions/status), the recommendation-set status and the model versions, each as a KPI tile.
 * When the set is missing, the recommendation step panel underneath offers "Generate recommendations".
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
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[8.5rem] rounded-xl" />
        ))}
      </div>
    )
  }

  if (status.isError && !noRun) {
    return (
      <Card>
        <ErrorState error={status.error} onRetry={status.refetch} retrying={status.isFetching} compact />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', status.isFetching && 'opacity-70 transition-opacity')}>
        <MetricCard
          icon={Database}
          tone="info"
          title="Data up to"
          value={formatDate(latestData)}
          caption={summary.isError ? 'Dashboard summary unavailable' : 'Latest daily inventory date'}
        />
        <MetricCard
          icon={Activity}
          tone={dataNewer ? 'warning' : 'primary'}
          title="Predictions for"
          muted={!run}
          value={run ? formatDate(run.prediction_date) : 'No run yet'}
          warn={dataNewer}
          caption={
            run
              ? dataNewer
                ? `Data newer than predictions (cutoff ${formatDate(run.data_cutoff_date)}) – run a refresh`
                : joinFacts([`Runs ${runLabel(run.demand_forecast?.model_run_id)} · ${runLabel(run.stockout?.model_run_id)}`, `completed ${formatDateTime(run.completed_at)}`])
              : 'Run a prediction refresh to create forecasts and stockout risks'
          }
        />
        <MetricCard
          icon={ClipboardList}
          tone={set?.status === 'current' ? 'success' : run ? 'warning' : 'neutral'}
          title="Recommendations"
          muted={!run}
          value={!run ? EM_DASH : set?.status === 'current' ? 'Current' : 'Missing'}
          warn={setMissing}
          caption={
            !run
              ? 'Generated with each prediction refresh'
              : set?.status === 'current'
                ? `Generated ${formatDateTime(set.generated_at)}`
                : 'No set for the latest run – generate it below'
          }
        />
        <MetricCard
          icon={Cpu}
          tone="violet"
          title="Models"
          muted={!run}
          value={run ? `${run.demand_forecast?.model_name} v${run.demand_forecast?.model_version}` : EM_DASH}
          caption={
            run
              ? joinFacts([
                  `${formatNumber(run.forecast_count)} forecasts`,
                  `${run.stockout?.model_name} v${run.stockout?.model_version}`,
                  `${formatNumber(run.stockout_count)} stockout predictions`,
                ])
              : 'Demand forecast and stockout models'
          }
        />
      </div>

      {/* Always mounted so a finished "Generate recommendations" stays visible after the set turns current. */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgb(15_42_55/0.04)] empty:hidden">
        <RecommendationStepPanel step={setMissing ? MISSING_STEP : null} modelRunId={run?.stockout?.model_run_id} />
      </div>
    </div>
  )
}
