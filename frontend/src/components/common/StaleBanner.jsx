import { Link } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Amber warning banner for stale / missing / data-newer-than-run situations (plan §7.1, §7.3).
 * @param {{ title: string, description?: string, to?: string, actionLabel?: string, className?: string }} props
 */
export default function StaleBanner({ title, description, to, actionLabel, className }) {
  return (
    <Alert className={cn('items-center border-warning/40 bg-warning-bg text-[#78350f] *:data-[slot=alert-description]:text-[#92400e]', className)}>
      <TriangleAlert className="text-[#b45309]" aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {description ? <AlertDescription>{description}</AlertDescription> : null}
      {to && actionLabel ? (
        <div className="col-start-2 mt-2 md:absolute md:top-1/2 md:right-3 md:col-start-auto md:mt-0 md:-translate-y-1/2">
          <Button asChild size="sm" className="bg-[#b45309] text-white hover:bg-[#92400e]">
            <Link to={to}>{actionLabel}</Link>
          </Button>
        </div>
      ) : null}
    </Alert>
  )
}
