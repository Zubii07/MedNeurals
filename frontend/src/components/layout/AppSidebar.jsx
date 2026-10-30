import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  Boxes,
  Database,
  LayoutDashboard,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useHealth } from '@/api/hooks'
import { cn } from '@/lib/utils'

/** Sidebar navigation (plan section 4). Product Analysis / Products are reached from search and tables. */
const NAV_ITEMS = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Inventory', to: '/inventory', icon: Boxes },
  { label: 'Stockout Risk Centre', to: '/stockout-risks', icon: ShieldAlert },
  { label: 'Recommendations', to: '/recommendations', icon: Sparkles },
  { label: 'Forecasts', to: '/forecasts', icon: TrendingUp },
  {
    label: 'Suppliers & POs',
    to: '/suppliers',
    icon: Truck,
    match: ['/suppliers', '/purchase-orders'],
    children: [
      { label: 'Suppliers', to: '/suppliers', end: true },
      { label: 'Purchase orders', to: '/purchase-orders' },
    ],
  },
  { label: 'Data & Predictions', to: '/data', icon: Database },
]

function isPathActive(pathname, item) {
  if (item.end) return pathname === item.to
  const prefixes = item.match ?? [item.to]
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-mint to-primary text-sidebar-primary-foreground shadow-[0_6px_16px_-6px_rgb(94_234_212/0.7)]">
        <Activity className="size-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[1.05rem] font-bold tracking-tight text-white">MedNeurals</span>
        <span className="block truncate text-[11px] font-medium text-sidebar-muted">Procurement Decision Support</span>
      </span>
    </Link>
  )
}

/** "API online / offline" from GET /health plus the app version (plan section 4). */
function ApiStatus() {
  const { data, isPending, isError } = useHealth()
  const online = !isPending && !isError && data?.status === 'ok'
  const label = isPending ? 'Checking API…' : online ? 'API online' : 'API offline'

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-medium text-sidebar-muted">v{__APP_VERSION__}</span>
      <span role="status" className={cn('flex items-center gap-2 font-medium', online ? 'text-sidebar-foreground' : 'text-sidebar-muted')}>
        <span
          aria-hidden="true"
          className={cn(
            'size-2 rounded-full',
            isPending && 'animate-pulse bg-sidebar-muted',
            !isPending && online && 'bg-success shadow-[0_0_0_3px_rgb(16_185_129/0.25)]',
            !isPending && !online && 'bg-danger shadow-[0_0_0_3px_rgb(225_29_72/0.25)]',
          )}
        />
        {label}
      </span>
    </div>
  )
}

const MENU_BUTTON_CLASSES =
  'relative h-11 rounded-xl px-3.5 text-[0.9rem] font-medium text-sidebar-foreground/85 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:ring-sidebar-ring data-active:bg-sidebar-accent data-active:text-white data-active:shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] data-active:before:absolute data-active:before:top-2.5 data-active:before:bottom-2.5 data-active:before:left-0 data-active:before:w-[3px] data-active:before:rounded-r-full data-active:before:bg-mint [&_svg]:size-[18px] [&_svg]:text-sidebar-muted data-active:[&_svg]:text-mint'

export default function AppSidebar() {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <SidebarHeader className="px-5 pt-5 pb-4">
        <Logo />
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup className="p-0 pt-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV_ITEMS.map((item) => {
                const active = isPathActive(pathname, item)
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} className={MENU_BUTTON_CLASSES}>
                      <Link to={item.to} onClick={closeOnMobile} aria-current={active ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>

                    {item.children && active ? (
                      <SidebarMenuSub className="mx-5 mt-1 border-sidebar-border px-2">
                        {item.children.map((child) => {
                          const childActive = isPathActive(pathname, child)
                          return (
                            <SidebarMenuSubItem key={child.to}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={childActive}
                                className="h-8 rounded-lg text-[0.82rem] text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-white data-active:bg-transparent data-active:font-semibold data-active:text-mint"
                              >
                                <Link to={child.to} onClick={closeOnMobile} aria-current={childActive ? 'page' : undefined}>
                                  <span>{child.label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-3 px-5 pb-5">
        <div className="h-px bg-sidebar-border" />
        <ApiStatus />
      </SidebarFooter>
    </Sidebar>
  )
}
