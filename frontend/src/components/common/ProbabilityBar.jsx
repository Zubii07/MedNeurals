import { formatPercent } from '@/lib/format'

/** Probability cell with a small bar (plan §7.2). */
export default function ProbabilityBar({ probability }) {
  const pct = Math.max(0, Math.min(100, (probability ?? 0) * 100))
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-14 text-right font-semibold tabular-nums">{formatPercent(probability)}</span>
    </div>
  )
}
