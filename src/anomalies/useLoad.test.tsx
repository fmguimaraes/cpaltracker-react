import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLoad } from './useLoad'

describe('useLoad with a cache peek (KAN-345)', () => {
  it('is ready at once from the cache, then updates in place when revalidation differs (FR24, EC13)', async () => {
    let resolve!: (v: string) => void
    const load = () => new Promise<string>((r) => (resolve = r))
    const peek = () => 'cached'
    const { result } = renderHook(() => useLoad(load, peek))
    expect(result.current.state).toEqual({ status: 'ready', value: 'cached' })
    act(() => resolve('fresh'))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'fresh' }))
  })

  it('keeps the cached value when revalidation fails (FR27)', async () => {
    const load = () => Promise.reject(new Error('boom'))
    const peek = () => 'cached'
    const { result } = renderHook(() => useLoad(load, peek))
    await waitFor(() => expect(result.current.revalidationFailed).toBe(true))
    expect(result.current.state).toEqual({ status: 'ready', value: 'cached' })
  })

  it('without a cached value it loads normally and errors normally', async () => {
    const load = () => Promise.reject(new Error('boom'))
    const peek = () => undefined
    const { result } = renderHook(() => useLoad(load, peek))
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('error'))
  })
})

describe('useLoad on a data key change (KAN-353)', () => {
  type K = 'A' | 'B'
  const hold = () => {
    const pending: Partial<Record<K, (v: string) => void>> = {}
    const loaders: Record<K, () => Promise<string>> = {
      A: () => new Promise<string>((r) => (pending.A = r)),
      B: () => new Promise<string>((r) => (pending.B = r)),
    }
    return { pending, loaders }
  }

  it("a new key with nothing cached shows loading, not the previous key's value", async () => {
    const { pending, loaders } = hold()
    const { result, rerender } = renderHook(({ key }: { key: K }) => useLoad(loaders[key], undefined, key), {
      initialProps: { key: 'A' as K },
    })
    act(() => pending.A!('alerts of A'))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'alerts of A' }))
    rerender({ key: 'B' })
    expect(result.current.state).toEqual({ status: 'loading' })
    act(() => pending.B!('alerts of B'))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'alerts of B' }))
  })

  it('a new key with a cached value shows that value at once', async () => {
    const load = { A: () => Promise.resolve('A fresh'), B: () => new Promise<string>(() => {}) }
    const peek = { A: () => undefined, B: () => 'B cached' }
    const { result, rerender } = renderHook(({ key }: { key: K }) => useLoad(load[key], peek[key], key), {
      initialProps: { key: 'A' as K },
    })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'A fresh' }))
    rerender({ key: 'B' })
    expect(result.current.state).toEqual({ status: 'ready', value: 'B cached' })
  })

  it('a new load with the same key keeps the displayed value while it fetches (FR27)', async () => {
    let resolveNext!: (v: string) => void
    const { result, rerender } = renderHook(
      ({ load }: { load: () => Promise<string> }) => useLoad(load, undefined, 'A'),
      { initialProps: { load: () => Promise.resolve('first') } },
    )
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'first' }))
    rerender({ load: () => new Promise<string>((r) => (resolveNext = r)) })
    expect(result.current.state).toEqual({ status: 'ready', value: 'first' })
    act(() => resolveNext('second'))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'second' }))
  })

  it('reload() keeps the displayed value while it fetches again (FR27)', async () => {
    let calls = 0
    const load = () => (++calls === 1 ? Promise.resolve('first') : new Promise<string>(() => {}))
    const { result } = renderHook(() => useLoad(load, undefined, 'A'))
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'first' }))
    act(() => result.current.reload())
    expect(result.current.state).toEqual({ status: 'ready', value: 'first' })
    expect(calls).toBe(2)
  })

  it('without a key the displayed value is kept across a new load, as before', async () => {
    const { result, rerender } = renderHook(({ load }: { load: () => Promise<string> }) => useLoad(load), {
      initialProps: { load: () => Promise.resolve('first') },
    })
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', value: 'first' }))
    rerender({ load: () => new Promise<string>(() => {}) })
    expect(result.current.state).toEqual({ status: 'ready', value: 'first' })
  })
})
