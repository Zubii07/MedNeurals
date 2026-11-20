import { Link, Outlet } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from './AuthProvider'

/**
 * Pathless layout route for admin-only pages (Data & Predictions, Users). A procurement officer sees a short card
 * instead of the page; the backend answers 403 to the same calls, so this only saves them the error.
 */
export default function RequireAdmin() {
  const { user } = useAuth()

  if (user?.role === 'ADMIN') return <Outlet />

  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <ShieldOff className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">Administrators only</h1>
          <p className="text-sm text-muted-foreground">
            This page is for administrators. Your account can view the dashboard, stockout risks, recommendations and forecasts.
          </p>
          <Button asChild className="mt-2 rounded-lg">
            <Link to="/">Go to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
