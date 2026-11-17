import StatTile from '@/components/common/StatTile'
import { formatDate, formatDateTime, formatNumber, runLabel } from '@/lib/format'

function modelLabel(info) {
  return info ? `${info.model_name} v${info.model_version}` : null
}

/**
 * Facts of one PredictionRun (§6.7) as small tiles: cutoff, prediction date, completion time and both model runs.
 * Used by the refresh result card on the Data & Predictions page.
 * @param {{ run: import('@/api/shapes').PredictionRun, className?: string }} props
 */
export default function PredictionRunDetails({ run, className }) {
  return (
    <div className={className}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <StatTile label="Data cutoff" value={formatDate(run.data_cutoff_date)} />
        <StatTile label="Prediction date" value={formatDate(run.prediction_date)} />
        <StatTile label="Completed at" value={formatDateTime(run.completed_at)} className="[&>div:nth-child(2)]:text-sm" />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <StatTile
          label="Demand model"
          value={modelLabel(run.demand_forecast)}
          hint={run.demand_forecast ? `run ${runLabel(run.demand_forecast.model_run_id)} · ${formatNumber(run.forecast_count)} forecasts` : undefined}
        />
        <StatTile
          label="Stockout model"
          value={modelLabel(run.stockout)}
          hint={run.stockout ? `run ${runLabel(run.stockout.model_run_id)} · ${formatNumber(run.stockout_count)} stockout predictions` : undefined}
        />
      </div>
    </div>
  )
}
