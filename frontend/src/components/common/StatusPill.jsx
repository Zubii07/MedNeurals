import { cn } from '@/lib/utils'

const STATUS_CLASSES = {
  ok: 'bg-success-bg text-[#047857]',
  error: 'bg-danger-bg text-danger',
  pending: 'bg-muted text-muted-foreground',
}

const DOT_CLASSES = {
  ok: 'bg-success',
  error: 'bg-danger',
  pending: 'bg-muted-foreground/60 animate-pulse',
}

/**
 * Pill with a coloured dot - used for "Database connected / offline" in the header
 * and "API online / offline" in the sidebar (plan section 4).
 *
 * @param {{ status: 'ok' | 'error' | 'pending', label: string, title?: string, className?: string }} props
 */
export default function StatusPill({ status = 'pending', label, title, className }) {
  return (
    <span
      role="status"
      title={title}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-xs font-medium whitespace-nowrap',
        STATUS_CLASSES[status] ?? STATUS_CLASSES.pending,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', DOT_CLASSES[status] ?? DOT_CLASSES.pending)} />
      {label}
    </span>
  )
}
