import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryResponse } from '../api/history'
import { usePulseTimeline } from './usePulseTimeline'

const fetchContractHistory = vi.fn<(...args: unknown[]) => Promise<HistoryResponse>>()
vi.mock('../api/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/history')>()),
  fetchContractHistory: (...args: unknown[]) => fetchContractHistory(...args),
}))

const NOW = new Date('2026-11-20T10:00:00Z')
const answer = (): HistoryResponse =>
  ({
    contract: { ContratID: 7 },
    devices: [],
    rows: [{ c: 'CHIP-1', t: NOW.getTime() - 3_600_000, ts: '', p: 0, la: 1, lo: 1, ta: 5, hr: 50, m: 1, g: 1, tm: null }],
    hooks: [],
    count: 1,
    total: 1,
    sampled: false,
    summaries: { ta: null, hr: null, m: null },
  }) as unknown as HistoryResponse

const props = (now: Date) => ({ contractId: 7, positions: [], now, initialInstant: NOW.getTime() - 3_600_000 })

beforeEach(() => fetchContractHistory.mockReset())

describe('usePulseTimeline history key (KAN-353)', () => {
  it('a period change with the fetch held does not report ready with the old rows', async () => {
    fetchContractHistory.mockResolvedValueOnce(answer())
    const { result } = renderHook((p) => usePulseTimeline(p), { initialProps: props(NOW) })
    await waitFor(() => expect(result.current.historyStatus).toBe('ready'))

    fetchContractHistory.mockReturnValueOnce(new Promise(() => {}))
    act(() => result.current.setChoice({ kind: 'preset', days: '7' }))
    await waitFor(() => expect(fetchContractHistory).toHaveBeenCalledTimes(2))
    expect(result.current.historyStatus).toBe('loading')
  })

  it('a refresh of the same preset keeps the rows while it refetches', async () => {
    fetchContractHistory.mockResolvedValueOnce(answer())
    const { result, rerender } = renderHook((p) => usePulseTimeline(p), { initialProps: props(NOW) })
    await waitFor(() => expect(result.current.historyStatus).toBe('ready'))

    fetchContractHistory.mockReturnValueOnce(new Promise(() => {}))
    rerender(props(new Date(NOW.getTime() + 2 * 24 * 3_600_000)))
    await waitFor(() => expect(fetchContractHistory).toHaveBeenCalledTimes(2))
    expect(result.current.historyStatus).toBe('ready')
  })
})
