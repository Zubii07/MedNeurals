import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import AppSidebar from './AppSidebar'
import Header from './Header'

/**
 * Application shell (plan section 3.1): fixed dark-teal sidebar (~272 px) on desktop, slide-in drawer
 * on phones, header on top of the scrolling main area.
 */
export default function AppLayout() {
  return (
    <SidebarProvider style={{ '--sidebar-width': '17rem' }}>
      <AppSidebar />
      <SidebarInset className="min-w-0 bg-background bg-[radial-gradient(ellipse_at_top_right,rgb(94_234_212/0.16),transparent_42%)] bg-no-repeat">
        <Header />
        <main className="flex-1 px-4 pb-10 pt-2 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
