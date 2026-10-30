import { SidebarTrigger } from '@/components/ui/sidebar'
import StatusPill from '@/components/common/StatusPill'
import ProductSearch from './ProductSearch'
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
 * Top bar (plan section 3.1): menu button on phones, product search typeahead and the database status pill.
 * No hospital selector, bell or user menu (plan section 4).
 */
export default function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <SidebarTrigger className="-ml-1 size-9 text-foreground md:hidden" aria-label="Open navigation" />

      <ProductSearch className="min-w-0 flex-1 md:max-w-2xl" />

      <div className="ml-auto flex shrink-0 items-center">
        <DatabaseStatusPill />
      </div>
    </header>
  )
}
