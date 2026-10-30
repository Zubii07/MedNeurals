import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TILE = {
  primary: 'bg-accent text-primary',
  danger: 'bg-danger-bg text-danger',
  warning: 'bg-warning-bg text-[#b45309]',
  success: 'bg-success-bg text-[#047857]',
  info: 'bg-info-bg text-info',
  violet: 'bg-violet-bg text-violet',
  neutral: 'bg-muted text-muted-foreground',
}

/**
 * Product-page section: icon tile + title + one-line description, optional right-hand action, content below.
 * @param {{ icon: import('react').ElementType, tone?: keyof typeof TILE, title: import('react').ReactNode, description?: import('react').ReactNode,
 *   action?: import('react').ReactNode, className?: string, contentClassName?: string, children: import('react').ReactNode }} props
 */
export default function SectionCard({ icon: Icon, tone = 'primary', title, description, action, className, contentClassName, children }) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', TILE[tone] ?? TILE.primary)}>
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn('min-w-0', contentClassName)}>{children}</CardContent>
    </Card>
  )
}
