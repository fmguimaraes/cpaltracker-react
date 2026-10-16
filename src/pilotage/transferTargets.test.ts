import { afterEach, describe, expect, it, vi } from 'vitest'
import * as contractsApi from '../api/contracts'
import { fetchTransferTargets } from './transferTargets'

describe('fetchTransferTargets (KAN-169 FR14)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps only STD contracts from the visible-contracts list', async () => {
    vi.spyOn(contractsApi, 'fetchContracts').mockResolvedValue([
      { contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' },
      { contractId: 34, contractRef: 'REF-034', contractType: 'STD' },
      { contractId: 56, contractRef: 'REF-056', contractType: 'STD' },
    ])

    const targets = await fetchTransferTargets()

    expect(targets.map((t) => t.contractId)).toEqual([34, 56])
  })

  it('returns an empty list when the caller has no visible STD contracts', async () => {
    vi.spyOn(contractsApi, 'fetchContracts').mockResolvedValue([
      { contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' },
    ])

    expect(await fetchTransferTargets()).toEqual([])
  })
})
