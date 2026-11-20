/**
 * TanStack Query hooks – one per endpoint (plan §5.2, conventions §5.4).
 *
 * Every hook takes the endpoint's query params as its first argument (they become part of the
 * query key) and an optional TanStack `options` object (enabled, refetchInterval, …) as the second.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiUpload } from './client'

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

/**
 * GET /products/{item_id} → ProductDetail (§6.4). 404 "Product X not found".
 * @param {string | undefined} itemId
 */
export function useProduct(itemId, options) {
  return useQuery({
    queryKey: ['products', 'detail', itemId],
    queryFn: ({ signal }) => apiGet(`/products/${encodeURIComponent(itemId)}`, undefined, { signal }),
    enabled: Boolean(itemId),
    ...options,
  })
}

/**
 * GET /products/{item_id}/analysis → ProductAnalysis (§6.4). 200 even without a run (run sections null); 404 unknown item.
 * @param {string | undefined} itemId
 */
export function useProductAnalysis(itemId, options) {
  return useQuery({
    queryKey: ['products', 'analysis', itemId],
    queryFn: ({ signal }) => apiGet(`/products/${encodeURIComponent(itemId)}/analysis`, undefined, { signal }),
    enabled: Boolean(itemId),
    ...options,
  })
}

/**
 * Distinct categories derived from GET /products?limit=1000 (there is no /categories endpoint, §6.11).
 * Grouping returned rows in the browser is allowed (§2 rule 3).
 */
export function useProductCategories() {
  return useProducts(
    { limit: 1000 },
    {
      staleTime: 30 * 60_000,
      select: (page) => {
        const byId = new Map()
        for (const item of page.items ?? []) {
          if (!byId.has(item.category_id)) byId.set(item.category_id, { category_id: item.category_id, category_name: item.category_name })
        }
        return [...byId.values()].sort((a, b) => a.category_id.localeCompare(b.category_id))
      },
    },
  )
}

/** Header typeahead: GET /products?search=…&limit=8 (plan §4). Disabled until `search` is non-empty. */
export function useProductSearch(search, options) {
  const term = (search ?? '').trim()
  return useProducts(
    { search: term, limit: 8 },
    { enabled: term.length > 0, staleTime: 5 * 60_000, placeholderData: (previous) => previous, ...options },
  )
}

/* -------------------------------------------------------------- suppliers */

/**
 * GET /suppliers → Page<SupplierRow> (§6.6).
 * @param {{ item_id?: string, active_only?: boolean, limit?: number, offset?: number }} [params]
 */
export function useSuppliers(params = {}, options) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: ({ signal }) => apiGet('/suppliers', params, { signal }),
    ...options,
  })
}

/**
 * Every supplier (15 rows) for dropdowns and id → name lookups. There is no /suppliers/{id} endpoint,
 * so pages read master fields from this list (already-returned rows, §2 rule 3).
 */
export function useSupplierList(options) {
  return useSuppliers({ limit: 1000 }, { staleTime: 30 * 60_000, ...options })
}

/**
 * GET /suppliers/{supplier_id}/performance → SupplierPerformance (§6.6). 404 "Supplier X not found".
 * @param {string | undefined} supplierId
 * @param {{ as_of?: string, include_emergency?: boolean }} [params]
 */
export function useSupplierPerformance(supplierId, params = {}, options) {
  return useQuery({
    queryKey: ['suppliers', 'performance', supplierId, params],
    queryFn: ({ signal }) => apiGet(`/suppliers/${encodeURIComponent(supplierId)}/performance`, params, { signal }),
    enabled: Boolean(supplierId),
    ...options,
  })
}

/* ------------------------------------------------- data & predictions (§7.11) */

/** POST /predictions/refresh takes ~70 s; the plan (§5.4) forbids a timeout below 180 s. */
const PREDICTION_REFRESH_TIMEOUT_MS = 180_000
const RECOMMENDATION_REFRESH_TIMEOUT_MS = 120_000
/** CSV imports: the demand file has millions of rows and is parsed and written server-side. */
const IMPORT_TIMEOUT_MS = 600_000

/**
 * GET /predictions/status → PredictionStatus (`recommendations` is null, §6.7).
 * 404 "no successful prediction run yet" before the first refresh (isNoPredictionRunError).
 */
export function usePredictionStatus(options) {
  return useQuery({
    queryKey: ['predictions', 'status'],
    queryFn: ({ signal }) => apiGet('/predictions/status', undefined, { signal }),
    ...options,
  })
}

/**
 * POST /predictions/refresh → PredictionStatus with the `recommendations` step (§6.7). Runs both models on the
 * latest inventory date and saves new runs (~70 s). Every query is invalidated afterwards (§5.4) so all views reload.
 */
export function useRefreshPredictions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['predictions', 'refresh'],
    mutationFn: () => apiPost('/predictions/refresh', undefined, { timeoutMs: PREDICTION_REFRESH_TIMEOUT_MS }),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

/**
 * POST /recommendations/refresh?model_run_id= → RecommendationSummary (§6.9). Idempotent: an existing set comes
 * back with `created: false`. 404 unknown / no completed run; 409 when the run cannot be used.
 * @returns mutation taking `{ model_run_id?: number }`
 */
export function useRefreshRecommendations() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['recommendations', 'refresh'],
    mutationFn: ({ model_run_id } = {}) =>
      apiPost('/recommendations/refresh', undefined, { params: { model_run_id }, timeoutMs: RECOMMENDATION_REFRESH_TIMEOUT_MS }),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

/**
 * POST /data/import (multipart) → ImportResult (§6.3). `cutoff` is omitted when empty (an empty string is a 422).
 * @returns mutation taking `{ dataset: string, file: File, cutoff?: string }`
 */
export function useImportData() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['data', 'import'],
    mutationFn: ({ dataset, file, cutoff }) => {
      const formData = new FormData()
      formData.append('dataset', dataset)
      formData.append('file', file, file.name)
      if (cutoff) formData.append('cutoff', cutoff)
      return apiUpload('/data/import', formData, { timeoutMs: IMPORT_TIMEOUT_MS })
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })
}

/* ------------------------------------------------------------------ models */

/**
 * GET /predictions/models → ModelDetails: what the trained models are and how they scored on their held-out test
 * period (thresholds, precision / recall per band, demand WAPE and P90 coverage). Static per artifact version.
 */
export function useModelDetails(options) {
  return useQuery({
    queryKey: ['predictions', 'models'],
    queryFn: ({ signal }) => apiGet('/predictions/models', undefined, { signal }),
    staleTime: 60 * 60_000,
    ...options,
  })
}

/* ------------------------------------------------------------------ demand */

/**
 * GET /demand/weekly → WeeklyDemand: complete Mon–Sun weeks of demand for one item (all sub-stores, or one store),
 * oldest first, the history line of the demand chart. `end_date` should be the run's prediction date so the last
 * history week is the one just before forecast week H1.
 * @param {{ item_id: string, store_id?: string, weeks?: number, end_date?: string }} params
 */
export function useWeeklyDemand(params, options) {
  return useQuery({
    queryKey: ['demand', 'weekly', params],
    queryFn: ({ signal }) => apiGet('/demand/weekly', params, { signal }),
    enabled: Boolean(params?.item_id),
    staleTime: 10 * 60_000,
    ...options,
  })
}

/* ------------------------------------------------------------ explanations */

/**
 * POST /products/{item_id}/explanation → ProductExplanation: one paragraph that restates the item's stored results.
 * POST because the first call stores the paragraph for the current run; later calls return the same text, so it is
 * safe to fetch like a query. The first call may take a few seconds (one LLM request).
 * @param {string | undefined} itemId
 */
export function useProductExplanation(itemId, options) {
  return useQuery({
    queryKey: ['products', 'explanation', itemId],
    queryFn: () => apiPost(`/products/${encodeURIComponent(itemId)}/explanation`, undefined, { timeoutMs: 45_000 }),
    enabled: Boolean(itemId),
    staleTime: 10 * 60_000,
    retry: false,
    ...options,
  })
}

/* ------------------------------------------------------------- auth / users */

/**
 * POST /auth/login → LoginResult (stage 6). 401 "Email or password is incorrect" / "This account has been
 * deactivated". The AuthProvider's `signIn` wraps this call and stores the token; use this hook only where the
 * mutation state itself is needed.
 * @returns mutation taking `{ email: string, password: string }`
 */
export function useLogin() {
  return useMutation({
    mutationKey: ['auth', 'login'],
    mutationFn: ({ email, password }) => apiPost('/auth/login', { email, password }),
  })
}

/** GET /users → {items: User[]} (admin only; 403 for an officer). */
export function useUsers(options) {
  return useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => apiGet('/users', undefined, { signal }),
    ...options,
  })
}

/**
 * POST /users → User (201). 409 duplicate email, 422 when the password is not 8–72 characters.
 * @returns mutation taking `{ name: string, email: string, role: Role, password: string }`
 */
export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['users', 'create'],
    mutationFn: (body) => apiPost('/users', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

/**
 * PATCH /users/{id} → User. Any of name, email, role, is_active, password. 409 duplicate email; 400 when an admin
 * tries to deactivate or demote themselves or the last active administrator.
 * @returns mutation taking `{ id: number, changes: Partial<User> & { password?: string } }`
 */
export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['users', 'update'],
    mutationFn: ({ id, changes }) => apiPatch(`/users/${encodeURIComponent(id)}`, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
