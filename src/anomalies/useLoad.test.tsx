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
