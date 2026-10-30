import { Link } from 'react-router-dom'
import { Activity, TriangleAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/common/EmptyState'
import ToneBadge from '@/components/common/ToneBadge'
import WidgetCard from '@/components/common/WidgetCard'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

function modelLabel(info) {
  if (!info) return '—'
  return `${info.model_name} v${info.model_version}`
}

/**
 * "Prediction run" card (replaces the design's Key Metrics, plan §4): cutoff, prediction date, both
 * models, recommendation-set status and the "data newer than predictions" warning.
 *
 * @param {{ summary: import('@/api/shapes').DashboardSummary | undefined, loading: boolean, dataNewer: boolean }} props
 */
export default function PredictionRunCard({ summary, loading, dataNewer }) {
  const run = summary?.prediction_run ?? null
  const set = summary?.recommendation_set

  let body
  if (loading) {
    body = (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    )
  } else if (!run) {
    body = <EmptyState icon={Activity} title="No successful prediction run yet." to="/data" linkLabel="Run a prediction refresh" compact />
  } else {
    body = (
      <>
        <dl className="divide-y divide-border/70">
          <Row label="Data cutoff">{formatDate(run.data_cutoff_date)}</Row>
          <Row label="Prediction date">{formatDate(run.prediction_date)}</Row>
          <Row label="Demand model">
            {modelLabel(run.demand_forecast)}
            <span className="block text-xs font-normal text-muted-foreground">{formatNumber(run.forecast_count)} forecasts</span>
          </Row>
          <Row label="Stockout model">
            {modelLabel(run.stockout)}
            <span className="block text-xs font-normal text-muted-foreground">{formatNumber(run.stockout_count)} predictions</span>
          </Row>
          <Row label="Recommendation set">
            {set?.status === 'current' ? (
              <ToneBadge label="Current" tone="success" />
            ) : (
              <Link to="/data" className="inline-flex">
                <ToneBadge label="Missing" tone="warning" />
              </Link>
            )}
            {set?.generated_at ? (
              <span className="block text-xs font-normal text-muted-foreground">{formatDateTime(set.generated_at)}</span>
            ) : null}
          </Row>
          <Row label="Latest data">{formatDate(summary?.latest_data_date)}</Row>
        </dl>
        {dataNewer ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-xs font-medium text-[#92400e]">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Data newer than predictions – run a prediction refresh.
          </p>
        ) : null}
      </>
    )
  }

  return (
    <WidgetCard title="Prediction run" description={run ? `Completed ${formatDateTime(run.completed_at)}` : 'Latest completed model run'}>
      {body}
    </WidgetCard>
  )
}
