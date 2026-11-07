import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ClipboardList, Clock, PackageCheck, Timer, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import DatePicker from '@/components/common/DatePicker'
import ErrorState from '@/components/common/ErrorState'
import NotFoundCard from '@/components/common/NotFoundCard'
import StaleBanner from '@/components/common/StaleBanner'
import SwitchField from '@/components/common/SwitchField'
import { useSupplierList, useSupplierPerformance } from '@/api/hooks'
import { useUrlFilters } from '@/hooks/use-url-filters'
import { formatDate, formatNumber, formatPaymentTerms, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTER_KEYS = ['as_of', 'include_emergency']
const NOT_ENOUGH = 'Not enough data'

/** Labels for the keys the backend may list in `unavailable` (app/services/supplier_stats.py). */
const UNAVAILABLE_LABELS = {
  lead_time: 'Lead time',
  lead_time_std_dev: 'Lead-time std dev',
  on_time_rate: 'On-time rate',
  fill_rate: 'Fill rate',
}

const TILE = {
  primary: 'bg-accent text-primary',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-[#047857]',
  violet: 'bg-violet-bg text-violet',
}

/** KPI card without the dashboard's "View details" link: icon tile, title, big value, caption. */
function MetricCard({ icon: Icon, tone = 'primary', title, value, caption, muted = false }) {
  return (
    <Card className="gap-0 py-5 [--card-spacing:--spacing(4)]">
      <div className="flex items-center gap-3 px-4">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TILE[tone] ?? TILE.primary)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="text-[13px] font-semibold leading-snug text-foreground">{title}</h3>
      </div>
      <div className="mt-4 px-4">
        <div className={cn('leading-none font-semibold tracking-tight tabular-nums', muted ? 'text-lg text-muted-foreground' : 'text-[2rem] text-foreground')}>{value}</div>
        {caption ? <div className="mt-2 text-xs text-muted-foreground">{caption}</div> : null}
      </div>
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-20" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
    </div>
  )
}

/** Days with at most one decimal: 11.0 -> "11", 10.9 -> "10.9". */
function formatDays(days) {
  return formatNumber(days, { maxDigits: 1 })
}

/** Comma-free caption pieces joined with " · ", skipping empty ones. */
function joinFacts(parts) {
  return parts.filter(Boolean).join(' · ')
}

/**
 * Supplier Performance (`/suppliers/:supplierId`, plan §7.9): lead time, on-time delivery and fill rate computed by
 * the backend from the supplier's completed purchase orders (formulas, no ML). `as_of` and `include_emergency`
 * live in the URL; master fields come from the already-loaded supplier list (no /suppliers/{id} endpoint).
 */
export default function SupplierPerformancePage() {
  const { supplierId } = useParams()
  const { filters, update } = useUrlFilters(FILTER_KEYS)
  const includeEmergency = filters.include_emergency === 'true'
  const query = useSupplierPerformance(
    supplierId,
    { as_of: filters.as_of, include_emergency: includeEmergency || undefined },
    { placeholderData: (previous) => previous },
  )
  const list = useSupplierList()
  const master = useMemo(() => (list.data?.items ?? []).find((row) => row.supplier_id === supplierId) ?? null, [list.data, supplierId])

  if (query.isPending) return <PageSkeleton />
  if (query.isError && query.error?.status === 404) {
    return <NotFoundCard title="Supplier not found" noun="supplier" id={supplierId} to="/suppliers" linkLabel="Back to Suppliers" />
  }
  if (query.isError) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
      </Card>
    )
  }

  const data = query.data
  const lead = data.lead_time ?? {}
  const onTime = data.on_time_delivery ?? {}
  const fill = data.fill_rate ?? {}
  const counts = data.order_counts ?? {}
  const period = data.data_period ?? {}
  const unavailable = Object.entries(data.unavailable ?? {})

  const masterLine = master
    ? joinFacts([
        master.supplier_type,
        master.reliability_class ? `${master.reliability_class} reliability` : null,
        master.typical_lead_time_days != null ? `contract lead time ${formatNumber(master.typical_lead_time_days)} days` : null,
        master.payment_terms ? formatPaymentTerms(master.payment_terms) : null,
        master.city,
      ])
    : null

  const extraCounts = joinFacts([
    counts.cancelled ? `${formatNumber(counts.cancelled)} cancelled` : null,
    counts.missing_receipt_date ? `${formatNumber(counts.missing_receipt_date)} missing receipt date` : null,
    counts.other_status ? `${formatNumber(counts.other_status)} other status` : null,
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-mint/40 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] sm:flex">
            <Truck className="size-7" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
              <Link to="/suppliers" className="hover:text-primary hover:underline">
                Suppliers
              </Link>
              <ChevronRight className="size-3" aria-hidden="true" />
              <span className="font-mono text-foreground">{data.supplier_id}</span>
            </nav>
            <h1 className="mt-1 text-[1.65rem] leading-tight font-semibold tracking-tight text-foreground">{data.supplier_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{masterLine ?? 'Measured from purchase orders · formulas, no ML'}</p>
          </div>
        </div>
        <Button asChild variant="outline" className="h-9 shrink-0 rounded-lg bg-card">
          <Link to={`/purchase-orders?supplier_id=${encodeURIComponent(data.supplier_id)}`}>
            <ClipboardList aria-hidden="true" />
            Purchase orders
          </Link>
        </Button>
      </div>

      <Card className="gap-4">
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="md:w-[16rem]">
              <Label htmlFor="perf-as-of" className="mb-1.5 text-xs text-muted-foreground">
                As of
              </Label>
              <DatePicker id="perf-as-of" value={filters.as_of} placeholder="All orders to date" onChange={(iso) => update({ as_of: iso })} />
            </div>
            <SwitchField id="perf-emergency" label="Include emergency orders" checked={includeEmergency} onCheckedChange={(checked) => update({ include_emergency: checked ? 'true' : '' })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Statistics from completed (received) orders{data.as_of ? ` placed and received on or before ${formatDate(data.as_of)}` : ''}
            {data.include_emergency ? ', emergency orders included' : ', emergency orders excluded'}.
            {query.isFetching ? ' Updating…' : ''}
          </p>
        </CardContent>
      </Card>

      {unavailable.length ? (
        <StaleBanner
          title="Some metrics cannot be computed for this selection."
          description={unavailable.map(([key, text]) => `${UNAVAILABLE_LABELS[key] ?? key}: ${text}`).join(' · ')}
        />
      ) : null}

      <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', query.isFetching && 'opacity-70 transition-opacity')}>
        <MetricCard
          icon={Timer}
          tone="primary"
          title="Lead time"
          muted={lead.mean_days == null}
          value={lead.mean_days != null ? `${formatDays(lead.mean_days)} days` : NOT_ENOUGH}
          caption={
            lead.mean_days != null
              ? joinFacts([
                  lead.median_days != null ? `Usually ${formatDays(lead.median_days)} days` : null,
                  lead.min_days != null && lead.max_days != null ? `between ${formatNumber(lead.min_days)} and ${formatNumber(lead.max_days)} days` : null,
                  `based on ${formatNumber(lead.sample_size)} order${lead.sample_size === 1 ? '' : 's'}`,
                ])
              : 'Order date to receipt date of completed orders'
          }
        />
        <MetricCard
          icon={Clock}
          tone="info"
          title="On-time delivery"
          muted={onTime.rate == null}
          value={onTime.rate != null ? formatPercent(onTime.rate) : NOT_ENOUGH}
          caption={onTime.rate != null ? `${formatNumber(onTime.on_time_count)} of ${formatNumber(onTime.sample_size)} received by the expected date` : 'Received on or before the expected delivery date'}
        />
        <MetricCard
          icon={PackageCheck}
          tone="success"
          title="Fill rate"
          muted={fill.rate == null}
          value={fill.rate != null ? formatPercent(fill.rate) : NOT_ENOUGH}
          caption={fill.rate != null ? joinFacts([`${formatNumber(fill.partially_filled_count)} partially filled`, `${formatNumber(fill.sample_size)} orders`]) : 'Accepted quantity over ordered quantity'}
        />
        <MetricCard
          icon={ClipboardList}
          tone="violet"
          title="Completed orders"
          value={formatNumber(counts.completed)}
          caption={joinFacts([
            `of ${formatNumber(counts.total)} total`,
            counts.open ? `${formatNumber(counts.open)} open` : null,
            counts.emergency_excluded ? `${formatNumber(counts.emergency_excluded)} emergency excluded` : null,
            extraCounts || null,
          ])}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {period.first_order_date
          ? joinFacts([
              `Orders ${formatDate(period.first_order_date)} – ${formatDate(period.last_order_date)}`,
              period.last_receipt_date ? `last receipt ${formatDate(period.last_receipt_date)}` : null,
            ])
          : 'No orders on or before the selected date.'}
      </p>
    </div>
  )
}
