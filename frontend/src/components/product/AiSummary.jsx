import { Sparkles } from 'lucide-react'
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
  const { text, source } = query.data
  return (
    <div className="rounded-xl border border-primary/20 bg-accent/40 px-4 py-3">
      <p className="text-[15px] leading-relaxed text-foreground">{text}</p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="size-3 text-primary" aria-hidden="true" />
        {source === 'llm' ? 'Written by AI from the figures on this page; it adds no numbers of its own.' : 'Built from the figures on this page.'}
      </p>
    </div>
  )
}
