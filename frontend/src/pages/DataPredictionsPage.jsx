import PageHeader from '@/components/common/PageHeader'
import ImportDataCard from '@/components/data/ImportDataCard'
import PredictionRefreshCard from '@/components/data/PredictionRefreshCard'
import StatusStrip from '@/components/data/StatusStrip'

/**
 * Data & Predictions (`/data`, plan §7.11, administrators only): one status card, then the two steps in the order
 * they are done – upload the new files, then update the predictions. The only page that writes to the backend.
 */
export default function DataPredictionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Data & Predictions" description="Upload the latest files, then update the predictions. Predictions only change when you update them." />
      <StatusStrip />
      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        <ImportDataCard />
        <PredictionRefreshCard />
      </div>
    </div>
  )
}
