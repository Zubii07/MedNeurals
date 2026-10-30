/**
 * Thin fetch wrapper for the MedNeurals backend (plan §5.3 / §6).
 *
 * All calls go through the `/api` prefix, which the Vite dev server proxies to
 * http://127.0.0.1:8000 (the backend has no CORS middleware and no `/api` prefix).
 */

export const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export const NETWORK_ERROR_MESSAGE = 'Cannot reach the API. Is the backend running on port 8000?'
export const TIMEOUT_ERROR_MESSAGE = 'The request timed out.'

/** Default per-request timeout. Long operations (e.g. POST /predictions/refresh, ~70 s) pass their own `timeoutMs`. */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Error thrown for every failed request.
 * `status` is the HTTP status, or 0 when the backend could not be reached (network error / timeout).
 * `message` is the backend `detail` text when available, flattened for 422 validation errors.
 * `detail` keeps the raw backend `detail` value (string, array or null).
 */
export class ApiError extends Error {
  constructor(status, message, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  /** True when no HTTP response was received at all. */
  get isNetworkError() {
    return this.status === 0
  }
}

/** Build `API_BASE + path + ?query`, skipping null/undefined/empty params. */
export function buildUrl(path, params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const qs = query.toString()
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`
}

/** Turn a backend `detail` value into one readable sentence. */
export function detailToMessage(detail, fallback) {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    // FastAPI 422: [{type, loc, msg, input, ...}]
    const parts = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const loc = Array.isArray(item.loc)
          ? item.loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'path').join('.')
          : ''
        return loc ? `${loc}: ${item.msg}` : item.msg
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  return fallback
}

async function request(path, { method = 'GET', params, body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const url = buildUrl(path, params)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onOuterAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onOuterAbort, { once: true })
  }

  let response
  try {
    response = await fetch(url, { method, body, headers, signal: controller.signal })
  } catch (error) {
    clearTimeout(timer)
    if (signal?.aborted) throw error // cancelled by the caller (e.g. TanStack Query)
    throw new ApiError(0, timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    const detail = data && typeof data === 'object' && !Array.isArray(data) ? data.detail : data
    const fallback = `Request failed (${response.status} ${response.statusText || ''})`.trim()
    throw new ApiError(response.status, detailToMessage(detail, fallback), detail ?? null)
  }
  return data
}

/**
 * GET request. `params` become the query string.
 * @param {string} path e.g. '/dashboard/summary'
 * @param {Record<string, unknown>} [params]
 * @param {{signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export function apiGet(path, params, options) {
  return request(path, { ...options, params })
}

/**
 * POST request. Objects are sent as JSON; FormData is sent as-is.
 * @param {string} path
 * @param {unknown} [body]
 * @param {{params?: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number, headers?: Record<string, string>}} [options]
 */
export function apiPost(path, body, options = {}) {
  const isJson = body !== undefined && body !== null && !(body instanceof FormData)
  return request(path, {
    ...options,
    method: 'POST',
    body: isJson ? JSON.stringify(body) : body,
    headers: isJson ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  })
}

/**
 * multipart/form-data upload (POST /data/import). The browser sets the Content-Type boundary.
 * @param {string} path
 * @param {FormData} formData
 * @param {{params?: Record<string, unknown>, signal?: AbortSignal, timeoutMs?: number}} [options]
 */
export function apiUpload(path, formData, options = {}) {
  return request(path, { ...options, method: 'POST', body: formData })
}

/** Message to show for any error object (ApiError or unknown). */
export function errorMessage(error) {
  if (error instanceof ApiError) return error.message
  if (error && typeof error.message === 'string') return error.message
  return 'Something went wrong.'
}
