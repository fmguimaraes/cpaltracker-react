import { useCallback, useEffect, useState } from 'react'

export type LoadState<T> = { status: 'loading' } | { status: 'error'; error?: unknown } | { status: 'ready'; value: T }

/** Runs `load` on mount and whenever it changes; `reload()` runs it again. A stale answer is ignored. */
export function useLoad<T>(load: () => Promise<T>): { state: LoadState<T>; reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    load().then(
      (value) => current && setState({ status: 'ready', value }),
      (error: unknown) => current && setState({ status: 'error', error }),
    )
    return () => {
      current = false
    }
    // `attempt` re-runs the same loader on demand.
  }, [load, attempt])

  const reload = useCallback(() => {
    // A displayed value stays on screen while it is fetched again.
    setState((previous) => (previous.status === 'ready' ? previous : { status: 'loading' }))
    setAttempt((n) => n + 1)
  }, [])

  return { state, reload }
}
