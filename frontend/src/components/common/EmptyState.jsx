import { Link } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Empty state (plan §7.4): icon + one sentence + an optional link to the next step.
 * @param {{ icon?: import('react').ElementType, title: string, description?: string, to?: string, linkLabel?: string, className?: string, compact?: boolean }} props
 */
export default function EmptyState({ icon: Icon = Inbox, title, description, to, linkLabel, className, compact = false }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-2 py-6' : 'gap-3 py-10', className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {to && linkLabel ? (
        <Link to={to} className="text-sm font-medium text-primary hover:underline">
          {linkLabel} →
        </Link>
      ) : null}
    </div>
  )
}
