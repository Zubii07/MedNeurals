/**
 * Formatting helpers (plan section 7.12). Formatting only - no business calculations.
 *
 * Dates: "30 Nov 2025"; datetimes: "28 Oct 2026, 11:52 PM" (local time).
 * Probabilities / rates: percent with 1 decimal ("94.3%"); quantities: thousands separators + unit ("5,760 Pack").
 * Forecast values: 1 decimal. PKR: "PKR 232,839". Horizons: "H1"-"H4".
 */

export const EM_DASH = '—'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const numberFormatters = new Map()

function numberFormatter(minDigits, maxDigits) {
  const key = `${minDigits}:${maxDigits}`
  let formatter = numberFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    })
    numberFormatters.set(key, formatter)
  }
  return formatter
}

function isNil(value) {
  return value === null || value === undefined || value === ''
}

/**
 * Parse an API date/datetime. Plain `YYYY-MM-DD` strings are read as local calendar dates
 * (not UTC midnight) so they never shift by a day.
 * @param {string | Date | null | undefined} value
 * @returns {Date | null}
 */
export function parseDate(value) {
  if (isNil(value)) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "30 Nov 2025" */
export function formatDate(value) {
  const date = parseDate(value)
  if (!date) return EM_DASH
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "28 Oct 2026, 11:52 PM" in the browser's local time. */
export function formatDateTime(value) {
  const date = parseDate(value)
  if (!date) return EM_DASH
  const hours24 = date.getHours()
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(date)}, ${hours12}:${minutes} ${period}`
}

/**
 * Number with thousands separators. Defaults to no decimals.
 * @param {number | null | undefined} value
 * @param {{ minDigits?: number, maxDigits?: number }} [options]
 */
export function formatNumber(value, { minDigits = 0, maxDigits = 0 } = {}) {
  if (isNil(value) || Number.isNaN(Number(value))) return EM_DASH
  return numberFormatter(minDigits, Math.max(minDigits, maxDigits)).format(Number(value))
}

/** Fixed number of decimals, e.g. formatDecimal(11.04, 1) -> "11.0". */
export function formatDecimal(value, digits = 1) {
  return formatNumber(value, { minDigits: digits, maxDigits: digits })
}

/** Forecast values: 1 decimal ("622.0"). */
export function formatForecast(value) {
  return formatDecimal(value, 1)
}

/** Quantity + unit: formatQuantity(5760, 'Pack') -> "5,760 Pack". */
export function formatQuantity(value, unit) {
  if (isNil(value)) return EM_DASH
  const number = formatNumber(value)
  return unit ? `${number} ${unit}` : number
}

/**
 * Rate in 0-1 as a percentage with 1 decimal: formatPercent(0.9431) -> "94.3%".
 * @param {number | null | undefined} rate
 * @param {number} [digits=1]
 */
export function formatPercent(rate, digits = 1) {
  if (isNil(rate) || Number.isNaN(Number(rate))) return EM_DASH
  return `${(Number(rate) * 100).toFixed(digits)}%`
}

/** Whole-number percentage of a count: formatShare(263, 403) -> "65%". Returns EM_DASH when total is 0. */
export function formatShare(count, total, digits = 0) {
  if (isNil(count) || !total) return EM_DASH
  return `${((Number(count) / Number(total)) * 100).toFixed(digits)}%`
}

/** "PKR 232,839" (rounded to whole rupees). */
export function formatPKR(value) {
  if (isNil(value) || Number.isNaN(Number(value))) return EM_DASH
  return `PKR ${formatNumber(Math.round(Number(value)))}`
}

/** Horizon integer -> "H1".."H4". */
export function horizonLabel(horizon) {
  if (isNil(horizon)) return EM_DASH
  return `H${horizon}`
}

/** "#120" style run id label. */
export function runLabel(modelRunId) {
  if (isNil(modelRunId)) return EM_DASH
  return `#${modelRunId}`
}

/** "11.0 ± 3.1 days (614 orders)"; parts that are null are left out. */
export function formatLeadTime(meanDays, stdDays, sampleSize) {
  if (isNil(meanDays)) return EM_DASH
  let text = `${formatDecimal(meanDays, 1)}`
  if (!isNil(stdDays)) text += ` ± ${formatDecimal(stdDays, 1)}`
  text += ' days'
  if (!isNil(sampleSize)) text += ` (${formatNumber(sampleSize)} orders)`
  return text
}

/** Truncate long text (reason columns); full text goes in a tooltip. */
export function truncate(text, maxLength = 80) {
  if (isNil(text)) return ''
  const value = String(text)
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}…` : value
}

/** Greeting by local time (plan section 3.3) - no user name until login exists. */
export function greetingForHour(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
