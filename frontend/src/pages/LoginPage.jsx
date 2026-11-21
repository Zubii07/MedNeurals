import { useId, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity, CircleAlert, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage } from '@/api/client'
import { cn } from '@/lib/utils'

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

/** Loose email check for the inline message only; the backend decides whether the account exists. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Field-level problems before anything is sent. Returns {} when the form can be submitted. */
function validate(email, password) {
  const problems = {}
  if (email.trim() === '') problems.email = 'Enter your email address.'
  else if (!EMAIL_PATTERN.test(email.trim())) problems.email = 'Enter a valid email address.'
  if (password === '') problems.password = 'Enter your password.'
  return problems
}

/** Logo mark + wordmark. */
function Brand({ dark = false, className }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-mint to-primary text-sidebar-primary-foreground shadow-[0_6px_16px_-6px_rgb(94_234_212/0.7)]">
        <Activity className="size-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className="leading-tight">
        <span className={cn('block text-[1.05rem] font-bold tracking-tight', dark ? 'text-white' : 'text-foreground')}>MedNeurals</span>
        <span className={cn('block text-[11px] font-medium', dark ? 'text-sidebar-muted' : 'text-muted-foreground')}>Procurement Decision Support</span>
      </span>
    </div>
  )
}

/* ------------------------------------------------------------ illustration */

/** Grey placeholder line standing in for text in the decorative preview. */
function TextBar({ className }) {
  return <span aria-hidden="true" className={cn('block h-2 rounded-full bg-slate-200', className)} />
}

/** Decorative stockout-risk rows: name placeholder, risk pill, probability bar. No numbers, by design. */
const RISK_ROWS = [
  { name: 'w-28', level: 'Urgent', pill: 'bg-danger-bg text-danger', bar: 'w-[82%] bg-danger' },
  { name: 'w-36', level: 'Urgent', pill: 'bg-danger-bg text-danger', bar: 'w-[68%] bg-danger' },
  { name: 'w-24', level: 'Review', pill: 'bg-warning-bg text-[#b45309]', bar: 'w-[41%] bg-warning' },
]

/** Small demand chart: solid history, dashed forecast with its band. Decorative, no axes or values. */
function MiniForecastChart() {
  return (
    <svg viewBox="0 0 320 96" className="h-24 w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="login-preview-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[20, 44, 68].map((y) => (
        <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="#e6ecf0" strokeWidth="1" />
      ))}
      <path d="M200 48 C 230 40, 262 36, 320 22 L 320 70 C 262 66, 230 62, 200 58 Z" fill="url(#login-preview-band)" />
      <path d="M0 72 C 30 66, 50 70, 80 60 S 130 44, 160 50 S 190 52, 200 48" fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M200 48 C 230 42, 262 38, 320 30" fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 5" />
      <line x1="200" y1="8" x2="200" y2="88" stroke="#0f2a37" strokeOpacity="0.18" strokeDasharray="2 4" />
      <circle cx="200" cy="48" r="4" fill="#ffffff" stroke="#0f766e" strokeWidth="2.5" />
    </svg>
  )
}

/**
 * Compact, clearly decorative dashboard card: what the officer sees after signing in (demand forecast, stockout
 * risks), with placeholder bars where real names and numbers would be. Nothing here comes from the backend.
 */
function DashboardPreview() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
        <div className="overflow-hidden rounded-xl bg-card text-card-foreground">
          {/* window bar */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-mint to-primary text-sidebar-primary-foreground">
              <Activity className="size-3" strokeWidth={2.6} />
            </span>
            <TextBar className="w-24 bg-slate-300" />
            <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">Illustration</span>
          </div>

          <div className="space-y-4 p-4">
            {/* KPI tiles */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Urgent risks', dot: 'bg-danger' },
                { label: 'Needs action', dot: 'bg-info' },
                { label: 'Open orders', dot: 'bg-violet' },
              ].map(({ label, dot }) => (
                <div key={label} className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('size-1.5 rounded-full', dot)} />
                    <span className="truncate text-[10px] font-medium text-muted-foreground">{label}</span>
                  </div>
                  <TextBar className="mt-3 h-3.5 w-12 rounded-md bg-slate-300" />
                </div>
              ))}
            </div>

            {/* forecast chart */}
            <div className="rounded-xl border border-border p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground">Demand forecast</span>
                <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded bg-primary" /> history
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded border-t-2 border-dashed border-primary" /> forecast
                  </span>
                </span>
              </div>
              <MiniForecastChart />
            </div>

            {/* risk rows */}
            <div className="rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-[11px] font-semibold text-foreground">Stockout risk</span>
                <TextBar className="w-16" />
              </div>
              <ul className="divide-y divide-border">
                {RISK_ROWS.map((row, index) => (
                  <li key={index} className="flex items-center gap-3 px-3 py-2">
                    <TextBar className={cn('shrink-0 bg-slate-300', row.name)} />
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', row.pill)}>{row.level}</span>
                    <span className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <span className={cn('block h-full rounded-full', row.bar)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* one floating detail card, for depth */}
      <div className="absolute -right-4 -bottom-5 hidden w-48 rounded-xl border border-border bg-card p-3 shadow-[0_18px_40px_-18px_rgb(15_42_55/0.45)] xl:block">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-foreground">Recommended action</span>
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-primary">Purchase</span>
        </div>
        <TextBar className="mt-2.5 w-full bg-slate-300" />
        <TextBar className="mt-1.5 w-2/3" />
      </div>
    </div>
  )
}

/** Left 55 %: brand, one headline, one sentence, the preview. Hidden below the large breakpoint. */
function BrandingPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[var(--sidebar-bg-to)] text-sidebar-foreground lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -top-40 -left-24 size-[32rem] rounded-full bg-[radial-gradient(circle,rgb(94_234_212/0.12),transparent_65%)]" />
      <div className="relative flex h-full min-h-0 flex-col px-12 pt-10 xl:px-16">
        <Brand dark className="shrink-0" />

        <div className="mt-14 shrink-0">
          <h2 className="max-w-md text-[2rem] leading-tight font-semibold tracking-tight text-white xl:text-[2.25rem]">
            Predict demand. <span className="text-mint">Prevent shortages.</span>
          </h2>
          <p className="mt-3 max-w-md text-[0.95rem] leading-relaxed text-sidebar-muted">
            Weekly demand forecasts and stockout warnings for every store, so orders go out before shelves run empty.
          </p>
        </div>

        {/* The card fades out at the bottom when the window is short, instead of being cut off. */}
        <div className="mt-10 min-h-0 flex-1 overflow-hidden pb-6 [mask-image:linear-gradient(to_bottom,black_75%,transparent_100%)]">
          <div className="max-w-xl">
            <DashboardPreview />
          </div>
        </div>
      </div>
    </aside>
  )
}

/* -------------------------------------------------------------------- page */

/**
 * Sign-in page (stage 6): branding and a decorative dashboard preview on the left (55 %), the form on the right
 * (45 %). Enter submits; the backend's `detail` text is shown above the button ("Email or password is incorrect",
 * "This account has been deactivated"). No sign-up and no password reset: the first administrator is created from
 * the backend command line and adds everyone else on the Users page.
 */
export default function LoginPage() {
  const { status, user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const ids = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [serverError, setServerError] = useState(null)

  // Already signed in (e.g. the browser's back button after logging in): skip the form.
  if (status === 'signed-in') return <Navigate to={destinationFrom(location, user)} replace />

  const emailId = `${ids}-email`
  const passwordId = `${ids}-password`
  const rememberId = `${ids}-remember`
  const emailErrorId = `${ids}-email-error`
  const passwordErrorId = `${ids}-password-error`
  const serverErrorId = `${ids}-server-error`

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return
    const problems = validate(email, password)
    setFieldErrors(problems)
    if (Object.keys(problems).length > 0) {
      document.getElementById(problems.email ? emailId : passwordId)?.focus()
      return
    }
    setSubmitting(true)
    setServerError(null)
    try {
      const signedIn = await signIn(email.trim(), password, { remember })
      navigate(destinationFrom(location, signedIn), { replace: true })
    } catch (err) {
      setServerError(errorMessage(err))
      setSubmitting(false)
      document.getElementById(passwordId)?.focus()
    }
  }

  const clearField = (field) => {
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }))
    if (serverError) setServerError(null)
  }

  const inputClasses = 'h-11 rounded-xl border-border bg-card px-3.5 text-[0.95rem] shadow-[0_1px_2px_rgb(15_42_55/0.04)] transition-[border-color,box-shadow] focus-visible:ring-4'

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[55fr_45fr]">
      <BrandingPanel />

      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[24rem]">
            <Brand className="mb-10 lg:hidden" />

            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-foreground">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Sign in to your procurement workspace.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor={emailId}>Email address</Label>
                <Input
                  id={emailId}
                  type="email"
                  name="email"
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="name@hospital.org"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    clearField('email')
                  }}
                  disabled={submitting}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? emailErrorId : undefined}
                  className={inputClasses}
                />
                {fieldErrors.email ? (
                  <p id={emailErrorId} className="text-xs font-medium text-danger">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor={passwordId}>Password</Label>
                <div className="relative">
                  <Input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      clearField('password')
                    }}
                    disabled={submitting}
                    aria-invalid={fieldErrors.password || serverError ? true : undefined}
                    aria-describedby={fieldErrors.password ? passwordErrorId : serverError ? serverErrorId : undefined}
                    className={cn(inputClasses, 'pr-12')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    disabled={submitting}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                  </button>
                </div>
                {fieldErrors.password ? (
                  <p id={passwordErrorId} className="text-xs font-medium text-danger">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2.5">
                <input
                  id={rememberId}
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  disabled={submitting}
                  className="size-4 cursor-pointer rounded border-border accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <Label htmlFor={rememberId} className="cursor-pointer text-sm font-normal text-foreground">
                  Keep me signed in
                </Label>
              </div>

              {serverError ? (
                <div id={serverErrorId} role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-bg px-3.5 py-3 text-sm text-danger">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-medium">{serverError}</span>
                    <span className="mt-0.5 block text-xs text-danger/80">Check your details and try again, or contact your administrator.</span>
                  </span>
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="h-11 w-full rounded-xl text-[0.95rem] font-semibold shadow-[0_8px_20px_-10px_rgb(15_118_110/0.8)] transition-[background-color,box-shadow]"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            <p className="mt-8 text-center text-xs text-muted-foreground">Need an account or a new password? Contact your administrator.</p>
          </div>
        </div>

        <p className="px-6 pb-5 text-center text-[11px] text-muted-foreground/70 sm:px-10">MedNeurals v{__APP_VERSION__}</p>
      </main>
    </div>
  )
}
