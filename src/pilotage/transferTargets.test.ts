import { afterEach, describe, expect, it, vi } from 'vitest'
import * as contractsApi from '../api/contracts'
import { fetchTransferTargets, transferTargetLabel } from './transferTargets'

const target = {
  contractId: 34,
  contractRef: 'REF-034',
  clientName: 'Sous-client',
  start: '2026-01-01 00:00:00',
  end: null,
}

describe('fetchTransferTargets (KAN-169 FR14)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('asks the API for the STD children of the given MAIN contract and returns them as is', async () => {
    const spy = vi.spyOn(contractsApi, 'fetchContractTransferTargets').mockResolvedValue([target])

    expect(await fetchTransferTargets(12)).toEqual([target])
    expect(spy).toHaveBeenCalledWith(12)
  })

  it('returns an empty list when the MAIN contract has no STD child', async () => {
    vi.spyOn(contractsApi, 'fetchContractTransferTargets').mockResolvedValue([])

    expect(await fetchTransferTargets(12)).toEqual([])
  })
})

describe('transferTargetLabel', () => {
  it('shows "REF · client name"', () => {
    expect(transferTargetLabel(target)).toBe('REF-034 · Sous-client')
  })

  it('falls back to the reference alone without a client name', () => {
    expect(transferTargetLabel({ ...target, clientName: null })).toBe('REF-034')
  })
})
