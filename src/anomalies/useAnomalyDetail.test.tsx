import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as anomaliesApi from '../api/anomalies'
import type { AnomalyDetail } from '../api/anomalies'
import { useAnomalyDetail } from './AnomalyDetailParts'

const detailOf = (anomalyKey: string, status: AnomalyDetail['status'] = 'en_cours'): AnomalyDetail =>
  ({ anomalyKey, status, contract: { contractId: 4, contractType: 'MAIN' } }) as AnomalyDetail

afterEach(() => vi.restoreAllMocks())

describe('useAnomalyDetail (KAN-353)', () => {
  it("another anomaly never shows the previous one's post-transition detail", async () => {
    let resolveB!: (d: AnomalyDetail) => void
    vi.spyOn(anomaliesApi, 'fetchAnomalyDetail').mockImplementation((_contract, key) =>
      key === 'A-1' ? Promise.resolve(detailOf('A-1')) : new Promise<AnomalyDetail>((r) => (resolveB = r)),
    )
    const { result, rerender } = renderHook(({ key }: { key: string }) => useAnomalyDetail(4, key), {
      initialProps: { key: 'A-1' },
    })
    await waitFor(() => expect(result.current.current?.anomalyKey).toBe('A-1'))
    act(() => result.current.setUpdated(detailOf('A-1', 'fermee')))
    expect(result.current.current?.status).toBe('fermee')

    rerender({ key: 'B-2' })
    expect(result.current.current).toBeNull()
    expect(result.current.state).toEqual({ status: 'loading' })
    act(() => resolveB(detailOf('B-2')))
    await waitFor(() => expect(result.current.current?.anomalyKey).toBe('B-2'))
  })
})
