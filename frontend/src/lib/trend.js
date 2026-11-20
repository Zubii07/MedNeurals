/**
 * Plain-English wording for a forecast trend from the backend (`forecast_trend` in app/api/dashboard.py).
 *
 * The backend rule: fit a straight line through the four weekly P50 values and express its change from the first
 * to the last week as a percentage of the mean weekly forecast. Within ±5% it is "stable"; beyond that, if the
 * week-to-week steps go both up and down by more than 1% of the mean it is "mixed"; otherwise "increasing" or
 * "decreasing". Nothing is recalculated here: only words are chosen.
 */
export const TREND_META = {
  increasing: { label: 'Increasing', short: 'Demand expected to rise', tone: 'info' },
  decreasing: { label: 'Decreasing', short: 'Demand expected to fall', tone: 'neutral' },
  stable: { label: 'Steady', short: 'Demand expected to stay steady', tone: 'neutral' },
  mixed: { label: 'Varies', short: 'Demand expected to vary week to week', tone: 'neutral' },
}

/** @param {{ direction: string } | null | undefined} trend */
export function trendMeta(trend) {
  return (trend && TREND_META[trend.direction]) ?? null
}

/** The unit as an officer would say it per week: "Each" is the item master's word for single units. */
export function unitWord(unit) {
  if (!unit) return 'units'
  return unit === 'Each' ? 'units' : unit
}
