import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken } from './client'
import { fetchAnomalies, peekAnomalies, postAnomalyComment, postAnomalyTransition } from './anomalies'
import { fetchPositions, peekPositions } from './positions'
import { fetchPulse, peekPulse } from './pulse'
import { postDeviceTransfer } from './transfer'
import { postDeviceConfig } from './deviceConfig'
import { CACHE_MAX_AGE_MS, clearCache, fetchAndStore, peekCache, type CacheKey } from './responseCache'

const key: CacheKey = { group: 'positions', fn: 'x', contractId: 1 }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('responseCache (KAN-345)', () => {
  beforeEach(() => {
    clearCache()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('hit: a stored value is returned until its maximum age (FR24)', async () => {
    await fetchAndStore(key, () => Promise.resolve('a'))
    expect(peekCache(key)).toBe('a')
    vi.advanceTimersByTime(CACHE_MAX_AGE_MS - 1)
    expect(peekCache(key)).toBe('a')
  })

  it('expiry: an entry at its maximum age is not shown (EC12)', async () => {
    await fetchAndStore(key, () => Promise.resolve('a'))
    vi.advanceTimersByTime(CACHE_MAX_AGE_MS)
    expect(peekCache(key)).toBeUndefined()
  })

  it('errors are never cached (EC20)', async () => {
    await expect(fetchAndStore(key, () => Promise.reject(new Error('500')))).rejects.toThrow()
    expect(peekCache(key)).toBeUndefined()
  })

  it('keys differ per contract and parameters', async () => {
    await fetchAndStore(key, () => Promise.resolve('one'))
    expect(peekCache({ ...key, contractId: 2 })).toBeUndefined()
    expect(peekCache({ ...key, params: 'p' })).toBeUndefined()
  })

  it('a response that started before a clear is not stored (EC11, EC14)', async () => {
    let resolve!: (v: string) => void
    const pending = fetchAndStore(key, () => new Promise<string>((r) => (resolve = r)))
    clearCache()
    resolve('late')
    await expect(pending).resolves.toBe('late')
    expect(peekCache(key)).toBeUndefined()
  })

  it('setAuthToken clears everything on logout and on another identity (FR25, EC14)', async () => {
    setAuthToken('user-a')
    await fetchAndStore(key, () => Promise.resolve('a'))
    setAuthToken('user-a')
    expect(peekCache(key)).toBe('a')
    setAuthToken('user-b')
    expect(peekCache(key)).toBeUndefined()
    await fetchAndStore(key, () => Promise.resolve('b'))
    setAuthToken(null)
    expect(peekCache(key)).toBeUndefined()
  })

  it('writes nothing to browser storage (FR26)', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem')
    await fetchAndStore(key, () => Promise.resolve('a'))
    expect(set).not.toHaveBeenCalled()
  })

  describe('through the API clients', () => {
    beforeEach(() => setAuthToken('tok'))
    afterEach(() => setAuthToken(null))

    it('fetchers always hit the network and refresh the cached value (refresh bypass)', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(json({ positions: [{ chipId: 'A' }] }))
        .mockResolvedValueOnce(json({ positions: [{ chipId: 'B' }] }))
      vi.stubGlobal('fetch', fetchMock)
      await fetchPulse(1)
      expect(peekPulse(1)).toEqual([{ chipId: 'A' }])
      await fetchPulse(1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(peekPulse(1)).toEqual([{ chipId: 'B' }])
    })

    it('a failed fetch leaves the cached value in place and caches nothing new (EC20, FR27)', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(json({ positions: [{ chipId: 'A' }] }))
          .mockResolvedValueOnce(json({ error: { code: 'server_error', message: 'x' } }, 500)),
      )
      await fetchPositions(1)
      await expect(fetchPositions(1)).rejects.toThrow()
      expect(peekPositions(1)).toEqual([{ chipId: 'A' }])
    })

    it('transition and comment invalidate the contract anomalies only (FR25)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => Promise.resolve(json({ anomalies: [], positions: [] }))),
      )
      await fetchAnomalies(1)
      await fetchAnomalies(2)
      await fetchPositions(1)
      await postAnomalyTransition(1, 'k', { from: 'detectee', to: 'en_cours', comment: '' })
      expect(peekAnomalies(1)).toBeUndefined()
      expect(peekAnomalies(2)).toEqual([])
      expect(peekPositions(1)).toEqual([])
      await fetchAnomalies(1)
      await postAnomalyComment(1, 'k', 'hi')
      expect(peekAnomalies(1)).toBeUndefined()
    })

    it('a failed mutation invalidates nothing', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(json({ anomalies: [] }))
          .mockResolvedValueOnce(json({ error: { code: 'x', message: 'x' } }, 500)),
      )
      await fetchAnomalies(1)
      await expect(postAnomalyComment(1, 'k', 'hi')).rejects.toThrow()
      expect(peekAnomalies(1)).toEqual([])
    })

    it('transfer and config invalidate positions, not anomalies (FR25)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => Promise.resolve(json({ anomalies: [], positions: [], contractId: 1 }))),
      )
      await fetchPositions(1)
      await fetchPulse(1)
      await fetchAnomalies(1)
      await postDeviceTransfer('D', { targetContractId: 2, startDate: '2026-01-01' })
      expect(peekPositions(1)).toBeUndefined()
      expect(peekPulse(1)).toBeUndefined()
      expect(peekAnomalies(1)).toEqual([])
      await fetchPositions(1)
      await postDeviceConfig('D', { a: '1' })
      expect(peekPositions(1)).toBeUndefined()
    })
  })
})
