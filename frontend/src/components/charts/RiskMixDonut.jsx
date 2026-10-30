import { useMemo } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { RISK_LEVELS, RISK_LEVEL_META, TONE_COLORS } from '@/lib/enums'
import { formatNumber, formatShare } from '@/lib/format'
import { cn } from '@/lib/utils'

const chartConfig = {
  URGENT: { label: 'Urgent', color: TONE_COLORS.danger },
  REVIEW: { label: 'Review', color: TONE_COLORS.warning },
  LOW: { label: 'Low', color: TONE_COLORS.success },
}

/**
 * Donut of URGENT / REVIEW / LOW item counts (`stockout_risk_counts` from /dashboard/summary).
 * Centre label = share of LOW-risk items. Percentages are shares of the counted items.
 *
 * @param {{ counts: Record<string, number>, className?: string }} props
 */
export default function RiskMixDonut({ counts, className }) {
  const { data, total } = useMemo(() => {
    const rows = RISK_LEVELS.map((level) => ({ level, label: RISK_LEVEL_META[level].label, value: counts?.[level] ?? 0 }))
    return { data: rows, total: rows.reduce((sum, row) => sum + row.value, 0) }
  }, [counts])

  const low = counts?.LOW ?? 0

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}>
      <div className="relative mx-auto size-[132px] shrink-0">
        <ChartContainer config={chartConfig} className="aspect-square h-[132px] w-[132px]">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="level" hideLabel />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="level"
              innerRadius={49}
              outerRadius={63}
              paddingAngle={total > 0 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {data.map((row) => (
                <Cell key={row.level} fill={chartConfig[row.level].color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold tabular-nums text-foreground">{formatShare(low, total)}</span>
          <span className="text-[11px] text-muted-foreground">Low risk</span>
        </div>
      </div>

      <ul className="mx-auto flex min-w-[7.5rem] flex-1 flex-col gap-2 text-[13px]">
        {data.map((row) => (
          <li key={row.level} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartConfig[row.level].color }} />
            <span className="text-muted-foreground">{row.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-foreground">{formatShare(row.value, total)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">({formatNumber(row.value)})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
