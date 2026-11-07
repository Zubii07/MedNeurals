import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PAGE_SIZES } from '@/lib/enums'

/** Select value that means "no filter" (Radix Select cannot use an empty string). */
export const ALL = 'all'

/**
 * Filters and pagination kept in the URL query string (plan §5.4), so list pages are linkable.
 *
 * `keys` lists the filter params to read; pass a module-level constant so the array is stable.
 * `update(changes)` writes the given params (empty / null / `ALL` removes one) and resets `offset`
 * unless `resetOffset: false` is passed (used by the pagination footer).
 *
 * @param {readonly string[]} keys
 * @returns {{ filters: Record<string, string> & { limit: number, offset: number }, update: (changes: Record<string, unknown>, options?: { resetOffset?: boolean }) => void }}
 */
export function useUrlFilters(keys) {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => {
    const limit = Number(searchParams.get('limit'))
    const offset = Number(searchParams.get('offset'))
    const result = {
      limit: PAGE_SIZES.includes(limit) ? limit : PAGE_SIZES[0],
      offset: Number.isInteger(offset) && offset > 0 ? offset : 0,
    }
    for (const key of keys) result[key] = searchParams.get(key) ?? ''
    return result
  }, [searchParams, keys])

  const update = useCallback(
    (changes, { resetOffset = true } = {}) => {
      const next = new URLSearchParams(searchParams)
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || value === null || value === undefined || value === ALL) next.delete(key)
        else next.set(key, String(value))
      }
      if (resetOffset) next.delete('offset')
      if (Number(next.get('limit')) === PAGE_SIZES[0]) next.delete('limit')
      if (next.get('offset') === '0') next.delete('offset')
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  return { filters, update }
}
