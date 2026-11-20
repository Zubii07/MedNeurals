/**
 * One row per week for the "Actual demand and forecast" chart: the recorded weeks first (actual), then the forecast
 * weeks (p50). The last recorded week also carries p50 = actual so the dashed forecast line starts where the solid
 * line ends. A recorded week with `demand_qty: null` stays null (a gap), never 0.
 *
 * @param {{ week_start: string, demand_qty: number | null }[]} history
 * @param {{ target_week: string, p50: number }[]} forecast
 */
export function mergeSeries(history, forecast) {
  const past = [...(history ?? [])]
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map((row) => ({ week: row.week_start, actual: row.demand_qty ?? null, p50: null, kind: 'actual' }))
  const future = [...(forecast ?? [])]
    .sort((a, b) => a.target_week.localeCompare(b.target_week))
    .map((row) => ({ week: row.target_week, actual: null, p50: row.p50, kind: 'forecast' }))
  const last = past[past.length - 1]
  if (last && last.actual != null && future.length) last.p50 = last.actual
  return [...past, ...future]
}
