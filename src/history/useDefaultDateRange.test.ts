import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDefaultDateRange } from './useDefaultDateRange'
import { formatIsoDate } from './dateRange'

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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the first (last-30-days) fetch as-is when the contract has no DebutContrat/FinContrat', async () => {
    const callCount = stubFetchSequence([new Response(JSON.stringify(historyBody()), { status: 200 })])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(callCount()).toBe(1)
  })

  it('issues a corrected second fetch when the contract has an explicit DebutContrat', async () => {
    const callCount = stubFetchSequence([
      new Response(JSON.stringify(historyBody({ DebutContrat: '2025-01-01' })), { status: 200 }),
      new Response(JSON.stringify(historyBody({ DebutContrat: '2025-01-01' })), { status: 200 }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(callCount()).toBe(2)
    if (result.current.status === 'ready') {
      expect(formatIsoDate(result.current.start)).toBe('2025-01-01')
    }
  })

  it('caps the resolved end at "now" for an open-ended contract with only a start date', async () => {
    stubFetchSequence([
      new Response(JSON.stringify(historyBody({ DebutContrat: '2020-01-01' })), { status: 200 }),
      new Response(JSON.stringify(historyBody({ DebutContrat: '2020-01-01' })), { status: 200 }),
    ])

    const { result } = renderHook(() => useDefaultDateRange(12))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    if (result.current.status === 'ready') {
      const now = new Date()
      expect(formatIsoDate(result.current.end)).toBe(formatIsoDate(now))
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
})
