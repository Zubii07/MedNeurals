import { useParams } from 'react-router-dom'
import PagePlaceholder from '@/components/common/PagePlaceholder'

export default function ProductAnalysisPage() {
  const { itemId } = useParams()
  return (
    <PagePlaceholder
      title="Product Analysis"
      description="Saved recommendation, stockout risk, demand forecast and live stock context for one item."
      phase="Phase F3 (product analysis and products)"
    >
      <p className="text-sm text-muted-foreground">
        Item: <span className="font-mono font-medium text-foreground">{itemId}</span>
      </p>
    </PagePlaceholder>
  )
}
