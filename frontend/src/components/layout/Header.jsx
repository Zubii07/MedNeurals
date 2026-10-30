import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SidebarTrigger } from '@/components/ui/sidebar'
import StatusPill from '@/components/common/StatusPill'
import { useHealthDb } from '@/api/hooks'

/** "Database connected" (green) / "Database offline" (red) from GET /health/db (plan section 4). */
function DatabaseStatusPill() {
  const { data, isPending, isError, error } = useHealthDb()

  if (isPending) {
    return <StatusPill status="pending" label="Checking database…" />
  }
  if (isError || data?.database !== 'connected') {
    return <StatusPill status="error" label="Database offline" title={error?.message} />
  }
  return <StatusPill status="ok" label="Database connected" />
}

/**
 * Top bar (plan section 3.1): menu button on phones, product search and the database status pill.
 * No hospital selector, bell or user menu (plan section 4). The search typeahead arrives in Phase F2.
 */
export default function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-background/80 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <SidebarTrigger className="-ml-1 size-9 text-foreground md:hidden" aria-label="Open navigation" />

      <div className="relative min-w-0 flex-1 md:max-w-2xl">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          readOnly
          aria-label="Search products"
          title="Product search arrives in Phase F2"
          placeholder="Search products by name or id…"
          className="h-11 rounded-xl border-border bg-card pr-4 pl-10 shadow-xs placeholder:text-muted-foreground/80 sm:pr-14"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:inline-flex"
        >
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex shrink-0 items-center">
        <DatabaseStatusPill />
      </div>
    </header>
  )
}
