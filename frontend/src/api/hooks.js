/**
 * TanStack Query hooks – one per endpoint (plan §5.2).
 * Phase F1 wires only the two health checks; page hooks are added with their pages.
 */
import { useQuery } from '@tanstack/react-query'
import { apiGet } from './client'

const HEALTH_POLL_MS = 30_000

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
