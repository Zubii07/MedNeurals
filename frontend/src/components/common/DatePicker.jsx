import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate, parseDate, toISODate } from '@/lib/format'
import { cn } from '@/lib/utils'

const START_MONTH = new Date(2015, 0, 1)
const END_MONTH = new Date(2035, 11, 1)

/**
 * Single-date filter field (plan §7.8–§7.10). `value` / `onChange` use `YYYY-MM-DD` strings so the date can
 * live in the URL. `minDate` / `maxDate` (same format) grey out days outside the allowed range.
 *
 * @param {{ id?: string, value: string, onChange: (iso: string) => void, placeholder?: string, minDate?: string, maxDate?: string, className?: string }} props
 */
export default function DatePicker({ id, value, onChange, placeholder = 'Any date', minDate, maxDate, className }) {
  const [open, setOpen] = useState(false)
  const selected = parseDate(value) ?? undefined
  const disabled = []
  const min = parseDate(minDate)
  const max = parseDate(maxDate)
  if (min) disabled.push({ before: min })
  if (max) disabled.push({ after: max })

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" aria-haspopup="dialog" aria-expanded={open} className="h-9 min-w-0 flex-1 justify-start bg-card px-3 font-normal">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? formatDate(value) : placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-auto rounded-xl p-0 shadow-lg">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? max ?? min ?? undefined}
            captionLayout="dropdown"
            startMonth={START_MONTH}
            endMonth={END_MONTH}
            disabled={disabled.length ? disabled : undefined}
            onSelect={(date) => {
              onChange(date ? toISODate(date) : '')
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {value ? (
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Clear date" className="shrink-0 text-muted-foreground" onClick={() => onChange('')}>
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
