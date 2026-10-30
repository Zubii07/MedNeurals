import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Dashboard widget shell: title + subtitle on the left, an optional "View all →" link (or any action)
 * on the right, content below. Matches the design's table/chart cards.
 *
 * @param {{ title: string, description?: import('react').ReactNode, to?: string, linkLabel?: string, action?: import('react').ReactNode,
 *   className?: string, contentClassName?: string, children: import('react').ReactNode }} props
 */
export default function WidgetCard({ title, description, to, linkLabel = 'View all', action, className, contentClassName, children }) {
  return (
    <Card className={cn('h-full gap-4', className)}>
      <CardHeader className="gap-0.5">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
        {to || action ? (
          <CardAction className="self-center">
            {action ??
              (to ? (
                <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {linkLabel}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null)}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className={cn('flex min-w-0 flex-1 flex-col', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
