/**
 * TanStack Query hooks – one per endpoint (plan §5.2, conventions §5.4).
 *
 * Every hook takes the endpoint's query params as its first argument (they become part of the
 * query key) and an optional TanStack `options` object (enabled, refetchInterval, …) as the second.
 */
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'

const HEALTH_POLL_MS = 30_000

/** Dashboard queries poll every 5 minutes (plan §5.4). */
export const DASHBOARD_REFETCH_MS = 5 * 60_000

/** GET /health → {status: 'ok'} – sidebar "API online/offline". */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/health', undefined, { signal, timeoutMs: 8_000 }),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 10_000,
    retry: false,
  })
}

/** GET /health/db → {status: 'ok', database: 'connected'}; 503 = offline – header status pill. */
export function useHealthDb() {
  return useQuery({
    queryKey: ['health', 'db'],
    queryFn: ({ signal }) => apiGet('/health/db', undefined, { signal, timeoutMs: 8_000 }),
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 10_000,
    retry: false,
  })
}

/* ------------------------------------------------------------- dashboard */

/** GET /dashboard/summary → DashboardSummary (§6.8). Always 200. */
export function useDashboardSummary(options) {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: ({ signal }) => apiGet('/dashboard/summary', undefined, { signal }),
    ...options,
  })
}

/* ----------------------------------------------------------- predictions */

/**
 * GET /stockout-risks → StockoutRiskPage (§6.7). 404 when there is no successful run.
 * @param {{ item_id?: string, store_id?: string, risk_level?: string, limit?: number, offset?: number }} [params]
 */
export function useStockoutRisks(params = {}, options) {
  return useQuery({
    queryKey: ['stockout-risks', params],
    queryFn: ({ signal }) => apiGet('/stockout-risks', params, { signal }),
    ...options,
  })
}

/**
 * GET /forecasts → ForecastPage (§6.7).
 * @param {{ item_id?: string, store_id?: string, horizon?: number, limit?: number, offset?: number }} [params]
 */
export function useForecasts(params = {}, options) {
  return useQuery({
    queryKey: ['forecasts', params],
    queryFn: ({ signal }) => apiGet('/forecasts', params, { signal }),
    ...options,
  })
}

/* ------------------------------------------------------- recommendations */

/**
 * GET /recommendations → RecommendationPage (§6.10). 404 when no set exists yet.
 * @param {{ model_run_id?: number, action?: string, priority?: string, status?: string, item_id?: string, store_id?: string, limit?: number, offset?: number }} [params]
 */
export function useRecommendations(params = {}, options) {
  return useQuery({
    queryKey: ['recommendations', params],
    queryFn: ({ signal }) => apiGet('/recommendations', params, { signal }),
    ...options,
  })
}

/* -------------------------------------------------- inventory & orders */

/**
 * GET /purchase-orders → Page<PurchaseOrderRow> (§6.5).
 * @param {{ item_id?: string, supplier_id?: string, status?: string, start_date?: string, end_date?: string, limit?: number, offset?: number }} [params]
 */
export function usePurchaseOrders(params = {}, options) {
  return useQuery({
    queryKey: ['purchase-orders', params],
    queryFn: ({ signal }) => apiGet('/purchase-orders', params, { signal }),
    ...options,
  })
}

/**
 * GET /inventory → Page<InventoryRow> (§6.5).
 * @param {{ item_id?: string, store_id?: string, start_date?: string, end_date?: string, stockout_only?: boolean, latest?: boolean, limit?: number, offset?: number }} [params]
 */
export function useInventory(params = {}, options) {
  return useQuery({
    queryKey: ['inventory', params],
    queryFn: ({ signal }) => apiGet('/inventory', params, { signal }),
    ...options,
  })
}

/* -------------------------------------------------------------- products */

/**
 * GET /products → Page<ProductSummary> (§6.4).
 * @param {{ search?: string, category_id?: string, ved_class?: string, limit?: number, offset?: number }} [params]
 */
export function useProducts(params = {}, options) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: ({ signal }) => apiGet('/products', params, { signal }),
    ...options,
  })
}

/** Header typeahead: GET /products?search=…&limit=8 (plan §4). Disabled until `search` is non-empty. */
export function useProductSearch(search, options) {
  const term = (search ?? '').trim()
  return useProducts(
    { search: term, limit: 8 },
    { enabled: term.length > 0, staleTime: 5 * 60_000, placeholderData: (previous) => previous, ...options },
  )
}
