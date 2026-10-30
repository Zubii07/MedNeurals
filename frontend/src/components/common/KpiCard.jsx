import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const TILE_CLASSES = {
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  success: 'bg-success-bg text-[#047857]',
  violet: 'bg-violet-bg text-violet',
  primary: 'bg-accent text-primary',
}

/**
 * KPI card (plan §3.2): rounded icon tile top-left, title beside it, big number, small caption and a
 * "View details →" link. `highlight` gives the red-tinted border/background of the first design card.
 *
 * @param {{ title: string, value: import('react').ReactNode, caption?: import('react').ReactNode, icon: import('react').ElementType,
 *   tone?: keyof typeof TILE_CLASSES, to: string, highlight?: boolean, loading?: boolean, className?: string }} props
 */
export default function KpiCard({ title, value, caption, icon: Icon, tone = 'info', to, highlight = false, loading = false, className }) {
  return (
    <Card
      className={cn(
        'gap-0 py-5 [--card-spacing:--spacing(4)]',
        highlight && 'border-danger/25 bg-[linear-gradient(180deg,#fff7f8_0%,#ffffff_100%)]',
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', TILE_CLASSES[tone] ?? TILE_CLASSES.info)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h3 className="text-[13px] font-semibold leading-snug text-foreground">{title}</h3>
      </div>

      <div className="mt-4 flex min-h-[3.25rem] flex-wrap items-end gap-x-3 gap-y-1 px-4">
        {loading ? (
          <>
            <Skeleton className="h-9 w-16" />
            <Skeleton className="mb-1 h-3 w-28" />
          </>
        ) : (
          <>
            <span className={cn('text-[2.25rem] leading-none font-semibold tracking-tight tabular-nums', highlight ? 'text-danger' : 'text-foreground')}>
              {value}
            </span>
            {caption ? <span className="pb-0.5 text-xs text-muted-foreground">{caption}</span> : null}
          </>
        )}
      </div>

      <Link
        to={to}
        className={cn(
          'mt-5 inline-flex items-center gap-1 self-start px-4 text-sm font-medium hover:underline',
          highlight ? 'text-danger' : 'text-primary',
        )}
      >
        View details
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </Card>
  )
}
