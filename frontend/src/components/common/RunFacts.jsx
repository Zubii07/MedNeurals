import { Activity } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * One-line "label value · label value" strip for run / set metadata under a page title
 * (plan §7.2, §7.3, §7.5: prediction date, model name + version, generated at …).
 * @param {{ title?: string, icon?: import('react').ElementType, items: { label: string, value: import('react').ReactNode }[], loading?: boolean, className?: string }} props
 */
export default function RunFacts({ title = 'Prediction run', icon: Icon = Activity, items, loading = false, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs', className)}>
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden="true" />
        {title}
      </span>
      {loading ? (
        <>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-44" />
        </>
      ) : (
        items.map(({ label, value }) => (
          <span key={label} className="text-muted-foreground">
            {label} <span className="font-medium text-foreground">{value}</span>
          </span>
        ))
      )}
    </div>
  )
}
