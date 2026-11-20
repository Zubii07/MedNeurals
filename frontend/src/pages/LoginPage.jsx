import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage } from '@/api/client'

/** Routes only an administrator may open (RequireAdmin); an officer signing in is sent to the dashboard instead. */
const ADMIN_PREFIXES = ['/data', '/admin']

/**
 * Where to go after signing in: the page the user was heading for, unless it is an administrator page and the
 * signed-in user is not an administrator (for example an officer signing in right after an admin signed out on the
 * Users page), else the dashboard.
 */
function destinationFrom(location, user) {
  const from = location.state?.from
  if (!from || typeof from.pathname !== 'string' || from.pathname === '/login') return '/'
  const adminOnly = ADMIN_PREFIXES.some((prefix) => from.pathname === prefix || from.pathname.startsWith(`${prefix}/`))
  if (adminOnly && user?.role !== 'ADMIN') return '/'
  return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
}

/**
 * Sign-in page (stage 6): centred card, email + password, Enter submits. The backend's `detail` text is shown
 * under the form ("Email or password is incorrect", "This account has been deactivated"). No sign-up: the first
 * administrator is created from the backend command line and adds everyone else on the Users page.
 */
export default function LoginPage() {
  const { status, user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Already signed in (e.g. the browser's back button after logging in): skip the form.
  if (status === 'signed-in') return <Navigate to={destinationFrom(location, user)} replace />

  const canSubmit = email.trim() !== '' && password !== '' && !submitting

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const signedIn = await signIn(email.trim(), password)
      navigate(destinationFrom(location, signedIn), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background bg-[radial-gradient(ellipse_at_top_right,rgb(94_234_212/0.16),transparent_42%)] bg-no-repeat px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-mint to-primary text-sidebar-primary-foreground shadow-[0_6px_16px_-6px_rgb(94_234_212/0.7)]">
            <Activity className="size-6" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <CardTitle className="text-xl font-bold tracking-tight">MedNeurals</CardTitle>
          <CardDescription>Sign in to Procurement Decision Support.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                name="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                className="h-10"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            {error ? (
              <p id="login-error" role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="h-10 w-full rounded-lg" disabled={!canSubmit}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
