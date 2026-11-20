import { useLocation } from 'react-router-dom'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import StatusPill from '@/components/common/StatusPill'
import ProductSearch from './ProductSearch'
import { useHealthDb } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import { ROLE_META, enumMeta } from '@/lib/enums'
import { firstName } from '@/lib/format'

/** Officer views where the technical database pill is hidden (the sidebar still shows API status). */
const PILL_HIDDEN_ON = ['/forecasts']

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

/** Signed-in user: first name as the trigger; full name, email, role and "Sign out" in the menu (stage 6). */
function UserMenu() {
  const { user, signOut } = useAuth()
  if (!user) return null
  const roleLabel = enumMeta(ROLE_META, user.role).label

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-1.5 rounded-full pr-2 pl-1.5" aria-label={`Account menu for ${user.name}`}>
          <span className="flex size-6 items-center justify-center rounded-full bg-accent text-primary">
            <UserRound className="size-3.5" aria-hidden="true" />
          </span>
          <span className="max-w-[8rem] truncate text-sm font-medium">{firstName(user.name) || user.email}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5 font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          <span className="block text-xs text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Top bar (plan section 3.1): menu button on phones, product search typeahead, the database status pill and the
 * user menu (stage 6). No hospital selector or bell (plan section 4).
 */
export default function Header() {
  const { pathname } = useLocation()
  const showPill = !PILL_HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <SidebarTrigger className="-ml-1 size-9 text-foreground md:hidden" aria-label="Open navigation" />

      <ProductSearch className="min-w-0 flex-1 md:max-w-2xl" />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showPill ? <DatabaseStatusPill /> : null}
        <UserMenu />
      </div>
    </header>
  )
}
