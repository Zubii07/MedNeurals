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

/**
 * Greeting by local time (plan section 3.3), with the signed-in user's first name when known:
 * "Good Morning, Ayesha". Morning is 5:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59; from 21:00 to 4:59
 * the greeting is a neutral "Welcome back" rather than calling 1 am "morning".
 * @param {number} [hour]
 * @param {string | null} [name] first name to append
 */
export function greetingForHour(hour = new Date().getHours(), name = null) {
  const base = hour < 5 ? 'Welcome Back' : hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : hour < 21 ? 'Good Evening' : 'Welcome Back'
  return name ? `${base}, ${name}` : base
}

/** First word of a full name ("Ayesha Khan" -> "Ayesha"); '' for empty input. */
export function firstName(fullName) {
  if (isNil(fullName)) return ''
  return String(fullName).trim().split(/\s+/)[0] ?? ''
}

/**
 * Local calendar date as `YYYY-MM-DD` (the inverse of parseDate; no UTC shift). Null/invalid -> ''.
 * @param {Date | null | undefined} date
 */
export function toISODate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** True when both `YYYY-MM-DD` strings are set and start is after end (ISO dates compare lexically). */
export function isDateRangeInvalid(start, end) {
  return Boolean(start && end && start > end)
}

/** Supplier payment terms in plain words: "Net 30" -> "Pay within 30 days"; other values are shown as stored. */
export function formatPaymentTerms(terms) {
  if (isNil(terms)) return EM_DASH
  const match = /^net\s*(\d+)$/i.exec(String(terms).trim())
  return match ? `Pay within ${match[1]} days` : String(terms)
}

/** Elapsed whole seconds as "42 s" or "1 min 12 s" (long-running refresh / import indicators). */
export function formatElapsed(seconds) {
  if (isNil(seconds) || Number.isNaN(Number(seconds))) return EM_DASH
  const total = Math.max(0, Math.floor(Number(seconds)))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`
}

/** File size as "824 B", "12.4 KB" or "3.2 MB". */
export function formatBytes(bytes) {
  if (isNil(bytes) || Number.isNaN(Number(bytes))) return EM_DASH
  const value = Number(bytes)
  if (value < 1024) return `${formatNumber(value)} B`
  if (value < 1024 * 1024) return `${formatDecimal(value / 1024, 1)} KB`
  return `${formatDecimal(value / (1024 * 1024), 1)} MB`
}

/**
 * Stockout probability for the officer: whole percent ("12%"), "<1%" below 1%. Whole percents are what the
 * calibration check on the 2025 hold-out supports (backend/docs/MODEL_EVALUATION.md §3).
 * @param {number | null | undefined} rate 0-1
 */
export function formatProbability(rate) {
  if (isNil(rate) || Number.isNaN(Number(rate))) return EM_DASH
  const value = Number(rate)
  if (value < 0.01) return '<1%'
  return `${Math.round(value * 100)}%`
}
