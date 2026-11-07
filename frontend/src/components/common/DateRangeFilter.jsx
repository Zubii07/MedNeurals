import { Label } from '@/components/ui/label'
import DatePicker from '@/components/common/DatePicker'
import { isDateRangeInvalid } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * "From" / "To" date pickers for a backend `start_date` / `end_date` pair (plan §7.8, §7.10).
 * Each picker greys out days beyond the other; the hint covers ranges typed straight into the URL
 * (the backend answers 400 for those, so callers also skip the query while `isDateRangeInvalid`).
 *
 * @param {{ id: string, label?: string, start: string, end: string, onChange: (next: { start_date?: string, end_date?: string }) => void, className?: string }} props
 */
export default function DateRangeFilter({ id, label, start, end, onChange, className }) {
  const invalid = isDateRangeInvalid(start, end)
  return (
    <div className={cn('min-w-0', className)}>
      {label ? <div className="mb-1.5 text-xs text-muted-foreground">{label}</div> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-from`} className="sr-only">
            {label ? `${label} from` : 'From'}
          </Label>
          <DatePicker id={`${id}-from`} value={start} maxDate={end || undefined} placeholder="From" onChange={(iso) => onChange({ start_date: iso })} />
        </div>
        <span className="hidden text-xs text-muted-foreground sm:block" aria-hidden="true">
          –
        </span>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${id}-to`} className="sr-only">
            {label ? `${label} to` : 'To'}
          </Label>
          <DatePicker id={`${id}-to`} value={end} minDate={start || undefined} placeholder="To" onChange={(iso) => onChange({ end_date: iso })} />
        </div>
      </div>
      {invalid ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          The start date must be on or before the end date.
        </p>
      ) : null}
    </div>
  )
}
