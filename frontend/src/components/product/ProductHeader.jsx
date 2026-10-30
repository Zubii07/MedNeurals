import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, FileText, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DefinitionList from '@/components/common/DefinitionList'
import ErrorState from '@/components/common/ErrorState'
import ToneBadge from '@/components/common/ToneBadge'
import { useProduct } from '@/api/hooks'
import { VED_CLASS_META, enumMeta } from '@/lib/enums'
import { formatDate, formatNumber, formatPKR } from '@/lib/format'
import { cn } from '@/lib/utils'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

function yesNo(value) {
  if (value === null || value === undefined) return null
  return value ? 'Yes' : 'No'
}

/** Expanded master data from GET /products/{id}: detail fields + supplier contracts (plan §7.6 item 1). */
function MasterData({ itemId }) {
  const { data, isPending, isError, error, refetch, isFetching } = useProduct(itemId)

  if (isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} retrying={isFetching} compact />

  const fields = [
    { label: 'Description', value: data.item_description },
    { label: 'Family key', value: data.family_key },
    { label: 'Hospital', value: data.hospital_id },
    { label: 'Primary cost centre', value: data.primary_cost_centre },
    { label: 'Material', value: data.material },
    { label: 'Sterile', value: yesNo(data.sterile_flag) },
    { label: 'Purchase pack', value: data.purchase_pack_description },
    { label: 'Size', value: data.size },
    { label: 'Gauge', value: data.gauge },
    { label: 'Length', value: data.length },
    { label: 'Target population', value: data.target_population },
    { label: 'Shelf life', value: data.shelf_life_days != null ? `${formatNumber(data.shelf_life_days)} days` : null },
    { label: 'Demand archetype', value: data.demand_archetype },
    { label: 'Imported', value: yesNo(data.imported_flag) },
    { label: 'Storage condition', value: data.storage_condition },
    { label: 'Storage temperature', value: data.storage_temperature },
    { label: 'Seasonality profile', value: data.seasonality_profile },
    { label: 'Variant demand weight', value: data.variant_demand_weight != null ? formatNumber(data.variant_demand_weight, { maxDigits: 2 }) : null },
    { label: 'Criticality', value: data.criticality },
    { label: 'Nominal lead time', value: data.nominal_lead_time_days != null ? `${formatNumber(data.nominal_lead_time_days)} days` : null },
    { label: 'Sub-category', value: data.sub_category },
  ]
  const contracts = data.supplier_items ?? []

  return (
    <div className="space-y-6">
      <DefinitionList items={fields} columns={3} />
      <div>
        <h3 className="mb-2 text-sm font-semibold">Supplier contracts</h3>
        {contracts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No supplier contracts on file for this item.</p>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className={HEAD}>Supplier</TableHead>
                <TableHead className={`${HEAD} text-right`}>Unit price</TableHead>
                <TableHead className={`${HEAD} text-right`}>MOQ (packs)</TableHead>
                <TableHead className={HEAD}>Preferred</TableHead>
                <TableHead className={`${HEAD} text-right`}>Lead time</TableHead>
                <TableHead className={HEAD}>Variability</TableHead>
                <TableHead className={HEAD}>Status</TableHead>
                <TableHead className={HEAD}>Contract</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map((row) => (
                <TableRow key={row.supplier_item_id} className="border-border/70">
                  <TableCell className="px-2 py-2.5">
                    <Link to={`/suppliers/${row.supplier_id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                      {row.supplier_id}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{row.supplier_item_id}</span>
                  </TableCell>
                  <TableCell className="px-2 py-2.5 text-right tabular-nums">{formatPKR(row.unit_price)}</TableCell>
                  <TableCell className="px-2 py-2.5 text-right tabular-nums">{formatNumber(row.minimum_order_quantity)}</TableCell>
                  <TableCell className="px-2 py-2.5">{row.preferred_supplier_flag ? <ToneBadge label="Preferred" tone="primary" icon={null} /> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="px-2 py-2.5 text-right tabular-nums">{formatNumber(row.lead_time_days)} days</TableCell>
                  <TableCell className="px-2 py-2.5">{row.lead_time_variability ?? '—'}</TableCell>
                  <TableCell className="px-2 py-2.5">{row.supply_status ?? '—'}</TableCell>
                  <TableCell className="px-2 py-2.5 text-xs whitespace-nowrap text-muted-foreground">
                    {formatDate(row.contract_start_date)} → {formatDate(row.contract_end_date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

function Chip({ label, value }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
      {label}
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  )
}

/**
 * Product Analysis header (plan §7.6 item 1): breadcrumb, name, category, VED badge, unit, pack size, unit cost,
 * and a "Master data" toggle that loads GET /products/{id}.
 * @param {{ item: import('@/api/shapes').ProductSummary }} props
 */
export default function ProductHeader({ item }) {
  const [open, setOpen] = useState(false)
  const ved = enumMeta(VED_CLASS_META, item.ved_class)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-mint/40 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] sm:flex">
            <Package className="size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link to="/products" className="hover:text-primary hover:underline">
                Products
              </Link>
              <ChevronRight className="size-3" aria-hidden="true" />
              <span className="font-mono text-foreground">{item.item_id}</span>
            </nav>
            <h1 className="mt-1 text-[1.65rem] leading-tight font-semibold tracking-tight text-foreground">{item.item_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.category_name}
              {item.sub_category ? ` · ${item.sub_category}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ToneBadge label={`${ved.label} (${item.ved_class})`} tone={ved.tone} icon={null} />
              <Chip label="Unit" value={item.uom} />
              <Chip label="Pack of" value={formatNumber(item.uom_per_purchase_pack)} />
              <Chip label="Unit cost" value={formatPKR(item.unit_cost_pkr)} />
              <Chip label="Nominal lead time" value={`${formatNumber(item.nominal_lead_time_days)} days`} />
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="h-9 shrink-0 rounded-lg bg-card">
          <FileText aria-hidden="true" />
          Master data
          <ChevronDown aria-hidden="true" className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>

      {open ? (
        <Card>
          <CardContent>
            <MasterData itemId={item.item_id} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
