import { useEffect, useState } from 'react'

/**
 * Whole seconds since `active` became true (0 while inactive). Ticks once a second; used for the
 * long-running prediction refresh and CSV import indicators (plan §5.4: "progress state with elapsed time").
 */
export function useElapsedSeconds(active) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const startedAt = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => {
      clearInterval(timer)
      setSeconds(0)
    }
  }, [active])
  return active ? seconds : 0
}
