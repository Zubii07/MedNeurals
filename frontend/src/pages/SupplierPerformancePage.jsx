import { useParams } from 'react-router-dom'
import PagePlaceholder from '@/components/common/PagePlaceholder'

export default function SupplierPerformancePage() {
  const { supplierId } = useParams()
  return (
    <PagePlaceholder
      title="Supplier Performance"
      description="Lead time, on-time delivery and fill rate statistics for one supplier."
      phase="Phase F5 (inventory, suppliers, purchase orders)"
    >
      <p className="text-sm text-muted-foreground">
        Supplier: <span className="font-mono font-medium text-foreground">{supplierId}</span>
      </p>
    </PagePlaceholder>
  )
}
