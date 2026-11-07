import { useEffect, useState } from 'react'

/** Returns `value` once it has been stable for `delay` ms (search boxes, plan §4: 300 ms). */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
