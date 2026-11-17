import { ClipboardCheck } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import ToneBadge from '@/components/common/ToneBadge'
import SectionCard from '@/components/product/SectionCard'
import PredictionRunDetails from '@/components/data/PredictionRunDetails'
import RecommendationStepPanel from '@/components/data/RecommendationStepPanel'
import { RUN_STATUS_META, enumMeta } from '@/lib/enums'
import { formatDateTime } from '@/lib/format'

/**
 * Result of POST /predictions/refresh (§7.11 step 2): the saved run and its recommendation step
 * (summary, or the error with a retry button).
 * @param {{ result: import('@/api/shapes').PredictionStatus }} props
 */
export default function RefreshResultCard({ result }) {
  const { label, tone } = enumMeta(RUN_STATUS_META, result.status)
  return (
    <SectionCard
      icon={ClipboardCheck}
      tone="success"
      title="Refresh result"
      description={`Completed ${formatDateTime(result.completed_at)}`}
      action={<ToneBadge label={label} tone={tone} />}
    >
      <div className="space-y-4">
        <PredictionRunDetails run={result} />
        <Separator />
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Recommendations</h3>
          {result.recommendations ? (
            <RecommendationStepPanel step={result.recommendations} modelRunId={result.stockout?.model_run_id} />
          ) : (
            <p className="text-xs text-muted-foreground">The backend did not report a recommendation step for this run.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Other pages reload their data automatically.</p>
      </div>
    </SectionCard>
  )
}
