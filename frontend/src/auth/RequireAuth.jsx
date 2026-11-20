import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from './AuthProvider'

/** Full-page placeholder while GET /auth/me answers (sidebar column, header, a few cards). */
function PageSkeleton() {
  return (
    <div className="flex min-h-svh bg-background" aria-busy="true" aria-label="Loading">
      <div className="hidden w-[17rem] shrink-0 bg-sidebar md:block" />
      <div className="flex-1 space-y-6 px-6 pt-4">
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-5 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  )
}

/**
 * Pathless layout route around the whole app: waits for the stored session to be checked, sends signed-out users
 * to /login (remembering where they were going), and renders the child routes once signed in.
 */
export default function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageSkeleton />
  if (status === 'signed-out') return <Navigate to="/login" state={{ from: location }} replace />
  return <Outlet />
}
