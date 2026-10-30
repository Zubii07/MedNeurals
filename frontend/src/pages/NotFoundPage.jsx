import { Link, useLocation } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <div className="mx-auto max-w-lg pt-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-danger-bg text-danger">
            <SearchX className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            There is no page at <span className="font-mono break-all">{pathname}</span>.
          </p>
          <Button asChild className="mt-2">
            <Link to="/">Go to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
