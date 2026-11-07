import { Link } from 'react-router-dom'
import { Database } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Full-width "No predictions yet" card (plan §7.1 / §7.4): shown when the backend has no successful
 * prediction run (or no recommendation set) instead of an empty table.
 * @param {{ title?: string, description?: string, actionLabel?: string }} props
 */
export default function NoPredictionsCard({
  title = 'No predictions yet',
  description = 'Import data and run a prediction refresh to see demand forecasts, stockout risks and recommendations here.',
  actionLabel = 'Go to Data & Predictions',
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
          <Database className="size-6" aria-hidden="true" />
        </span>
        <p className="text-base font-semibold">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        <Button asChild className="mt-1 rounded-xl">
          <Link to="/data">{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
