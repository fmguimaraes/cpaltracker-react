import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDefaultDateRange } from './useDefaultDateRange'
import { formatIsoDate } from './dateRange'

const NOW = new Date(Date.UTC(2026, 5, 15))

function historyBody(overrides: Partial<{ DebutContrat: string | null; FinContrat: string | null }> = {}) {
  return {
    contract: {
      ContratID: 12,
      ContratRef: 'REF-12',
      ContratType: 'STANDARD',
      ClientID: 1,
      DebutContrat: null,
      FinContrat: null,
      ...overrides,
    },
    devices: [],
    rows: [],
    hooks: [],
    count: 0,
    total: 0,
    sampled: false,
  }
}

function stubFetchSequence(responses: Response[]) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const response = responses[Math.min(call, responses.length - 1)]
      call += 1
      return Promise.resolve(response.clone())
    }),
  )
  return () => call
}

describe('useDefaultDateRange (KAN-170 FR3)', () => {
  beforeEach(() => {
    // Only `Date` is faked (not timers) so `waitFor`'s own polling, which
    // relies on real setTimeout/MutationObserver, keeps working.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses the first (last-30-days) fetch as-is when the contract has no DebutContrat/FinContrat', async () => {
    const callCount = stubFetchSequence([new Response(JSON.stringify(historyBody()), { status: 200 })])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(callCount()).toBe(1)
  })

  it('issues a corrected second fetch when the contract has an explicit DebutContrat within the last year', async () => {
    const callCount = stubFetchSequence([
      new Response(JSON.stringify(historyBody({ DebutContrat: '2026-01-01' })), { status: 200 }),
      new Response(JSON.stringify(historyBody({ DebutContrat: '2026-01-01' })), { status: 200 }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(callCount()).toBe(2)
    if (result.current.status === 'ready') {
      expect(formatIsoDate(result.current.start as Date)).toBe('2026-01-01')
    }
  })

  it('caps the resolved end at "now" and clamps start to 1 year before it, for an open-ended contract older than a year (review gate round 1: the resolved default must stay within the endpoint\'s own 1-year span limit, or the corrected fetch itself gets rejected)', async () => {
    const callCount = stubFetchSequence([
      new Response(JSON.stringify(historyBody({ DebutContrat: '2020-01-01' })), { status: 200 }),
      new Response(JSON.stringify(historyBody({ DebutContrat: '2020-01-01' })), { status: 200 }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(callCount()).toBe(2)
    if (result.current.status === 'ready') {
      expect(formatIsoDate(result.current.end as Date)).toBe(formatIsoDate(NOW))
      expect(formatIsoDate(result.current.start as Date)).toBe('2025-06-15')
    }
  })

  it('recovers instead of erroring when the resolved default would otherwise violate the endpoint\'s own range rules (review gate round 1 regression guard)', async () => {
    // The corrected fetch's range (as formatted/sent) must itself be
    // accepted by the real validation rules — assert that directly here,
    // not just that the hook's own clamp ran, so a future change to either
    // side of this contract can't silently drift back out of sync.
    const { validateDateRangeInputs } = await import('./dateRange')
    stubFetchSequence([
      new Response(JSON.stringify(historyBody({ DebutContrat: '2015-01-01' })), { status: 200 }),
      new Response(JSON.stringify(historyBody({ DebutContrat: '2015-01-01' })), { status: 200 }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status === 'ready') {
      const sentRange = validateDateRangeInputs(
        formatIsoDate(result.current.start as Date),
        formatIsoDate(result.current.end as Date),
      )
      expect(sentRange.ok).toBe(true)
    }
  })

  it('reports "unauthorized" on a 404, distinct from a generic error (mirrors KAN-168)', async () => {
    stubFetchSequence([
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('unauthorized'))
  })

  it('reports a generic error on a service failure', async () => {
    stubFetchSequence([
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB down' } }), {
        status: 503,
      }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  describe('applyRange (KAN-176 FR5-FR8, NFR8 — DateRangePicker wiring)', () => {
    it('re-fetches with the explicit range and lands back in "ready" with that exact range, not a re-derived default', async () => {
      const callCount = stubFetchSequence([
        new Response(JSON.stringify(historyBody()), { status: 200 }),
        new Response(JSON.stringify(historyBody()), { status: 200 }),
      ])

      const { result } = renderHook(() => useDefaultDateRange(12))
      await waitFor(() => expect(result.current.status).toBe('ready'))

      const explicitStart = new Date(Date.UTC(2026, 0, 1))
      const explicitEnd = new Date(Date.UTC(2026, 0, 15))
      if (result.current.status !== 'ready') throw new Error('expected ready')
      // `act`'s callback must stay sync (no returned promise) here, or `act`
      // silently switches to async mode without being awaited and the
      // `applyRange` state transitions race the assertions below.
      act(() => {
        if (result.current.status === 'ready') result.current.applyRange({ start: explicitStart, end: explicitEnd })
      })

      await waitFor(() => expect(callCount()).toBe(2))
      await waitFor(() => expect(result.current.status).toBe('ready'))
      if (result.current.status === 'ready') {
        expect(formatIsoDate(result.current.start as Date)).toBe('2026-01-01')
        expect(formatIsoDate(result.current.end as Date)).toBe('2026-01-15')
      }
    })

    it('reports "unauthorized" when the explicit range re-fetch 404s, same as the default path', async () => {
      const responses = [
        new Response(JSON.stringify(historyBody()), { status: 200 }),
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 }),
      ]
      let call = 0
      vi.stubGlobal(
        'fetch',
        vi.fn(() => {
          const response = responses[Math.min(call, responses.length - 1)]
          call += 1
          return Promise.resolve(response.clone())
        }),
      )

      const { result } = renderHook(() => useDefaultDateRange(12))
      await waitFor(() => expect(result.current.status).toBe('ready'))
      if (result.current.status !== 'ready') throw new Error('expected ready')
      act(() => {
        if (result.current.status === 'ready') result.current.applyRange({ start: null, end: null })
      })

      await waitFor(() => expect(result.current.status).toBe('unauthorized'))
    })
  })
})
