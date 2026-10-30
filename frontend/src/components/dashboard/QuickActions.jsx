import { Link } from 'react-router-dom'
import { ArrowLeftRight, ChevronRight, RefreshCw, Truck, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Navigation-only shortcuts (plan §4) – nothing here writes to the backend. */
const ACTIONS = [
  { label: 'Run prediction refresh', to: '/data', icon: RefreshCw },
  { label: 'Import new data', to: '/data', icon: Upload },
  { label: 'Check supplier performance', to: '/suppliers', icon: Truck },
  { label: 'View transfer recommendations', to: '/recommendations?action=TRANSFER', icon: ArrowLeftRight },
]

export default function QuickActions() {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Quick actions</CardTitle>
      </CardHeader>
      <CardContent className="px-3">
        <ul className="flex flex-col gap-1">
          {ACTIONS.map(({ label, to, icon: Icon }) => (
            <li key={label}>
              <Link
                to={to}
                className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
