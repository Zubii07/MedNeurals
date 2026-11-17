import PageHeader from '@/components/common/PageHeader'
import ImportDataCard from '@/components/data/ImportDataCard'
import PredictionRefreshCard from '@/components/data/PredictionRefreshCard'
import StatusStrip from '@/components/data/StatusStrip'

/**
 * Data & Predictions (`/data`, plan §7.11): status tiles for data, predictions, recommendations and models;
 * the long-running prediction refresh (with recommendation retry); and the CSV import form.
 * The only page that writes to the backend.
 */
export default function DataPredictionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Data & Predictions" description="Import CSV data and run the ML models. Predictions only change after a refresh." />
      <StatusStrip />
      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <PredictionRefreshCard />
        <ImportDataCard />
      </div>
    </div>
  )
}
