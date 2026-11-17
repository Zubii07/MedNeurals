import { Skeleton } from '@/components/ui/skeleton'
import { useProductExplanation } from '@/api/hooks'

/**
 * The one-paragraph summary for the officer (backend Phase 12): the item's stored forecast, risk, delivery and
 * recommendation put into words. Nothing here is computed; the text comes from POST /products/{id}/explanation.
 * While it loads, or if it fails, `fallback` (the rule engine's own reason) is shown instead.
 * @param {{ itemId: string, enabled: boolean, fallback: import('react').ReactNode }} props
 */
export default function AiSummary({ itemId, enabled, fallback }) {
  const query = useProductExplanation(itemId, { enabled })
  if (!enabled || query.isError) return fallback ?? null
  if (query.isPending) {
    return (
      <div className="space-y-2 rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
        <p className="text-[11px] text-muted-foreground">Writing the summary…</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-primary/20 bg-accent/40 px-4 py-3">
      <p className="text-[15px] leading-relaxed text-foreground">{query.data.text}</p>
    </div>
  )
}
