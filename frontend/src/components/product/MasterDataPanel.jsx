import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DefinitionList from '@/components/common/DefinitionList'
import ErrorState from '@/components/common/ErrorState'
import ToneBadge from '@/components/common/ToneBadge'
import { useProduct } from '@/api/hooks'
import { formatDate, formatNumber, formatPKR } from '@/lib/format'

const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

function yesNo(value) {
  if (value === null || value === undefined) return null
  return value ? 'Yes' : 'No'
}

/** Master data from GET /products/{id}: detail fields and supplier contracts. Loaded only when opened. */
export default function MasterDataPanel({ itemId }) {
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
    { label: 'Unit cost', value: formatPKR(data.unit_cost_pkr) },
    { label: 'Nominal lead time', value: data.nominal_lead_time_days != null ? `${formatNumber(data.nominal_lead_time_days)} days` : null },
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
