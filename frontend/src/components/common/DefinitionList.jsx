import { cn } from '@/lib/utils'
import { EM_DASH } from '@/lib/format'

/**
 * Label / value grid for detail fields.
 * @param {{ items: { label: string, value?: import('react').ReactNode, hint?: string }[], columns?: 1 | 2 | 3, className?: string }} props
 */
export default function DefinitionList({ items, columns = 2, className }) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map(({ label, value, hint }) => (
        <div key={label} className="min-w-0 border-b border-border/60 pb-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words text-foreground">
            {value === null || value === undefined || value === '' ? <span className="text-muted-foreground">{EM_DASH}</span> : value}
            {hint ? <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
