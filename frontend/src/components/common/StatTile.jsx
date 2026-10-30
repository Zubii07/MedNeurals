import { cn } from '@/lib/utils'

/** Small label / value tile used inside sections and summary cards. */
export default function StatTile({ label, value, hint, tone, className }) {
  return (
    <div className={cn('rounded-xl bg-muted/60 px-3 py-2.5', className)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-base font-semibold tabular-nums text-foreground', tone === 'danger' && 'text-danger')}>{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}
