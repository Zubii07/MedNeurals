import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Centred "not found" card for detail routes whose id the backend rejects with 404 (plan §7.6, §7.9).
 * @param {{ title: string, noun: string, id: string, to: string, linkLabel: string }} props
 */
export default function NotFoundCard({ title, noun, id, to, linkLabel }) {
  return (
    <div className="mx-auto max-w-lg pt-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-danger-bg text-danger">
            <SearchX className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">
            There is no {noun} with id <span className="font-mono break-all text-foreground">{id}</span>.
          </p>
          <Button asChild className="mt-2 rounded-lg">
            <Link to={to}>{linkLabel}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
