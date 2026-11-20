import StatTile from '@/components/common/StatTile'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

/**
 * What one prediction update produced (PredictionRun, §6.7), in plain words: the data it used, the date it predicts
 * from, when it finished, and how many forecasts and stockout risks it wrote. Model names and run ids are not
 * shown; the API still carries them.
 * @param {{ run: import('@/api/shapes').PredictionRun, className?: string }} props
 */
export default function PredictionRunDetails({ run, className }) {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Data used" value={formatDate(run.data_cutoff_date)} hint="latest inventory date" />
        <StatTile label="Predictions from" value={formatDate(run.prediction_date)} hint="next 4 weeks / 14 days" />
        <StatTile label="Finished" value={formatDateTime(run.completed_at)} className="[&>div:nth-child(2)]:text-sm" />
        <StatTile label="Weekly forecasts" value={formatNumber(run.forecast_count)} hint="product × store × week" />
        <StatTile label="Stockout risks" value={formatNumber(run.stockout_count)} hint="product × store" />
      </div>
    </div>
  )
}
