import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { VED_CLASS_META, enumMeta } from '@/lib/enums'
import { EM_DASH, formatDate, formatNumber } from '@/lib/format'

function Fact({ label, children }) {
  return (
    <span className="whitespace-nowrap">
      {label} <span className="font-medium text-foreground">{children}</span>
    </span>
  )
}

/**
 * Section 1 – product information, kept to one compact block: name and id, category, unit and pack, the date the
 * stock figures are from. Master data lives in the details section.
 * @param {{ analysis: import('@/api/shapes').ProductAnalysis }} props
 */
export default function ProductSummaryHeader({ analysis }) {
  const item = analysis.item
  const ved = enumMeta(VED_CLASS_META, item.ved_class)
  const asOf = analysis.current_stock?.as_of_date ?? analysis.prediction_run?.data_cutoff_date ?? null

  return (
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/products" className="hover:text-primary hover:underline">
            Products
          </Link>
          <ChevronRight className="size-3" aria-hidden="true" />
          <span className="font-mono text-foreground">{item.item_id}</span>
        </nav>
        <h1 className="mt-1 text-[1.5rem] leading-tight font-semibold tracking-tight text-foreground">{item.item_name}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {item.category_name}
          {item.sub_category ? ` · ${item.sub_category}` : ''}
        </p>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground lg:justify-end">
        <Fact label="Unit">{item.uom ?? EM_DASH}</Fact>
        <Fact label="Pack of">{item.uom_per_purchase_pack != null ? `${formatNumber(item.uom_per_purchase_pack)} ${item.uom ?? ''}`.trim() : EM_DASH}</Fact>
        <Fact label="Class">{item.ved_class ? `${ved.label} (${item.ved_class})` : EM_DASH}</Fact>
        <Fact label="Data as of">{asOf ? formatDate(asOf) : EM_DASH}</Fact>
      </dl>
    </header>
  )
}
