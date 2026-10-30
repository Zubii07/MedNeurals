import { Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Placeholder body for pages that arrive in a later phase (plan section 8).
 * Shows the real page title so navigation and routes can be verified in Phase F1.
 *
 * @param {{ title: string, description: string, phase: string, children?: import('react').ReactNode }} props
 */
export default function PagePlaceholder({ title, description, phase, children }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
            <Hammer className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">This page is built in {phase}.</p>
          <p className="max-w-md text-sm text-muted-foreground">
            The route, navigation and layout shell are in place. Data views arrive with their phase.
          </p>
          {children}
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link to="/">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
