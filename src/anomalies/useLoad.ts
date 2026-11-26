import { useCallback, useEffect, useRef, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'error'; error?: unknown } | { status: 'ready'; value: T }

const ready = <T,>(value: T): LoadState<T> => ({ status: 'ready', value })

/**
 * Runs `load` on mount and whenever it changes; `reload()` runs it again. A stale answer is ignored.
 *
 * KAN-345 (FR24, FR27): with `peek` (stable identity), a cached value younger than the cache's maximum age
 * is ready at once (no loading state) and `load` still runs to revalidate it; if that revalidation fails the
 * cached value stays on screen (`revalidationFailed` tells the caller, no error state).
 */
export function useLoad<T>(
  load: () => Promise<T>,
  peek?: () => T | undefined,
): { state: LoadState<T>; reload: () => void; revalidationFailed: boolean } {
  const [state, setState] = useState<LoadState<T>>(() => {
    const cached = peek?.()
    return cached === undefined ? { status: 'loading' } : ready(cached)
  })
  const [attempt, setAttempt] = useState(0)
  const [revalidationFailed, setRevalidationFailed] = useState(false)
  // Whether the displayed value came from the cache for the run in flight.
  const seeded = useRef(false)

  useEffect(() => {
    let current = true
    const cached = peek?.()
    seeded.current = cached !== undefined
    setRevalidationFailed(false)
    if (cached !== undefined) setState((prev) => (prev.status === 'ready' && prev.value === cached ? prev : ready(cached)))
    load().then(
      (value) => current && setState(ready(value)),
      (error: unknown) => {
        if (!current) return
        if (seeded.current) setRevalidationFailed(true)
        else setState({ status: 'error', error })
      },
    )
    return () => {
      current = false
    }
    // `attempt` re-runs the same loader on demand.
  }, [load, peek, attempt])

  const reload = useCallback(() => {
    // A displayed value stays on screen while it is fetched again.
    setState((previous) => (previous.status === 'ready' ? previous : { status: 'loading' }))
    setAttempt((n) => n + 1)
  }, [])

  return { state, reload, revalidationFailed }
}
