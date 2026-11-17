import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * A card that opens on click: title (and a one-line description) in the header, content below. Used for details an
 * officer needs only sometimes, so the page stays short by default.
 * @param {{ title: string, description?: import('react').ReactNode, defaultOpen?: boolean, className?: string, children: import('react').ReactNode }} props
 */
export default function Expandable({ title, description, defaultOpen = false, className, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          {description ? <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="border-t border-border/70 px-5 py-4">{children}</div> : null}
    </Card>
  )
}
