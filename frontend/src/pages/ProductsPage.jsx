import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PackageSearch, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import EmptyState from '@/components/common/EmptyState'
import ErrorState from '@/components/common/ErrorState'
import PageHeader from '@/components/common/PageHeader'
import TablePagination from '@/components/common/TablePagination'
import ToneBadge from '@/components/common/ToneBadge'
import { useProductCategories, useProducts } from '@/api/hooks'
import { PAGE_SIZES, VED_CLASSES, VED_CLASS_META, enumMeta } from '@/lib/enums'
import { formatNumber, formatPKR } from '@/lib/format'

const ALL = 'all'
const HEAD = 'h-9 bg-muted/60 px-2 text-xs font-medium text-muted-foreground first:rounded-l-lg last:rounded-r-lg'

/** Read list state from the URL (plan §5.4: filters and pagination live in the query string). */
function readParams(params) {
  const limit = Number(params.get('limit'))
  const offset = Number(params.get('offset'))
  return {
    search: params.get('search') ?? '',
    category_id: params.get('category_id') ?? '',
    ved_class: params.get('ved_class') ?? '',
    limit: PAGE_SIZES.includes(limit) ? limit : PAGE_SIZES[0],
    offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
  }
}

/** Products list (`/products`, plan §7.7): search + category + VED filters, paginated, rows open Product Analysis. */
export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = readParams(searchParams)
  const [searchText, setSearchText] = useState(filters.search)
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  const debounce = useRef(null)
  // Keep the box in sync when the URL changes elsewhere (back button, header "See all results").
  if (filters.search !== syncedSearch) {
    setSyncedSearch(filters.search)
    setSearchText(filters.search)
  }

  const update = (changes, { resetOffset = true } = {}) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === null || value === undefined || value === ALL) next.delete(key)
      else next.set(key, String(value))
    }
    if (resetOffset) next.delete('offset')
    if (Number(next.get('limit')) === PAGE_SIZES[0]) next.delete('limit')
    setSearchParams(next, { replace: true })
  }

  // Debounce the search box into the URL (300 ms).
  const onSearchChange = (value) => {
    setSearchText(value)
    clearTimeout(debounce.current)
    debounce.current = setTimeout(() => update({ search: value.trim() }), 300)
  }
  useEffect(() => () => clearTimeout(debounce.current), [])

  const query = useProducts(
    { search: filters.search, category_id: filters.category_id, ved_class: filters.ved_class, limit: filters.limit, offset: filters.offset },
    { placeholderData: (previous) => previous },
  )
  const categories = useProductCategories()
  const rows = query.data?.items ?? []
  const total = query.data?.total ?? 0
  const hasFilters = Boolean(filters.search || filters.category_id || filters.ved_class)

  let body
  if (query.isPending) {
    body = (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    )
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={query.refetch} retrying={query.isFetching} />
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={PackageSearch}
        title={hasFilters ? 'No products match these filters.' : 'No products in the database yet.'}
        description={hasFilters ? 'Try a shorter search term or clear the filters.' : 'Import the medical items master from Data & Predictions.'}
        to={hasFilters ? undefined : '/data'}
        linkLabel="Go to Data & Predictions"
      />
    )
  } else {
    body = (
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className={HEAD}>Item</TableHead>
            <TableHead className={HEAD}>Category</TableHead>
            <TableHead className={HEAD}>VED</TableHead>
            <TableHead className={HEAD}>Unit</TableHead>
            <TableHead className={`${HEAD} text-right`}>Pack size</TableHead>
            <TableHead className={`${HEAD} text-right`}>Unit cost</TableHead>
            <TableHead className={`${HEAD} text-right`}>Lead time</TableHead>
            <TableHead className={HEAD}>Criticality</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const ved = enumMeta(VED_CLASS_META, item.ved_class)
            return (
              <TableRow key={item.item_id} className="border-border/70">
                <TableCell className="w-full min-w-[220px] max-w-0 px-2 py-2.5">
                  <Link to={`/products/${item.item_id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline" title={item.item_name}>
                    {item.item_name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {item.item_id}
                    {item.sub_category ? ` · ${item.sub_category}` : ''}
                  </span>
                </TableCell>
                <TableCell className="px-2 py-2.5 text-sm" title={item.category_name}>
                  <span className="block max-w-[200px] truncate">{item.category_name}</span>
                  <span className="block text-xs text-muted-foreground">{item.category_id}</span>
                </TableCell>
                <TableCell className="px-2 py-2.5">
                  <ToneBadge label={ved.label} tone={ved.tone} icon={null} className="px-2" />
                </TableCell>
                <TableCell className="px-2 py-2.5 text-sm">{item.uom}</TableCell>
                <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums">{formatNumber(item.uom_per_purchase_pack)}</TableCell>
                <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums">{formatPKR(item.unit_cost_pkr)}</TableCell>
                <TableCell className="px-2 py-2.5 text-right text-sm tabular-nums">{formatNumber(item.nominal_lead_time_days)} d</TableCell>
                <TableCell className="px-2 py-2.5 text-sm">{item.criticality}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Medical items master. Open an item for its saved recommendation, stockout risk, forecast and live stock." />

      <Card className="gap-4">
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
            <div className="min-w-0 flex-1 md:min-w-[16rem]">
              <Label htmlFor="product-search" className="mb-1.5 text-xs text-muted-foreground">
                Search
              </Label>
              <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="product-search"
                  type="search"
                  value={searchText}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Name or item id…"
                  className="h-9 bg-card pl-8 [&::-webkit-search-cancel-button]:appearance-none"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="product-category" className="mb-1.5 text-xs text-muted-foreground">
                Category
              </Label>
              <Select value={filters.category_id || ALL} onValueChange={(value) => update({ category_id: value })}>
                <SelectTrigger id="product-category" className="h-9 w-full bg-card md:w-[18rem]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.category_id} value={category.category_id}>
                      {category.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="product-ved" className="mb-1.5 text-xs text-muted-foreground">
                VED class
              </Label>
              <Select value={filters.ved_class || ALL} onValueChange={(value) => update({ ved_class: value })}>
                <SelectTrigger id="product-ved" className="h-9 w-full bg-card md:w-[10rem]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {VED_CLASSES.map((ved) => (
                    <SelectItem key={ved} value={ved}>
                      {ved} · {VED_CLASS_META[ved].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => update({ search: '', category_id: '', ved_class: '' })}>
                <X aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {query.isPending ? 'Loading…' : `${formatNumber(total)} item${total === 1 ? '' : 's'}${hasFilters ? ' match' : ''}`}
            {query.isFetching && !query.isPending ? ' · updating…' : ''}
          </p>

          {body}

          {!query.isPending && !query.isError && total > 0 ? (
            <TablePagination total={total} limit={filters.limit} offset={filters.offset} onChange={(next) => update(next, { resetOffset: false })} disabled={query.isFetching} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
