import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { isContractInactiveError } from './activeState'

describe('isContractInactiveError (KAN-159 FR4, NFR4)', () => {
  it('recognizes the API\'s own 409 "contract_inactive" signal', () => {
    expect(
      isContractInactiveError(
        new ApiError(409, "Ce contrat n'est pas actif aujourd'hui.", 'contract_inactive'),
      ),
    ).toBe(true)
  })

  it('does not treat a different 409 code as inactive (e.g. a transfer overlap)', () => {
    expect(isContractInactiveError(new ApiError(409, 'Overlap', 'transfer_overlap'))).toBe(false)
  })

  it('does not treat a 403 as inactive', () => {
    expect(
      isContractInactiveError(
        new ApiError(403, 'Device pilotage is limited to MAIN contracts.', 'forbidden'),
      ),
    ).toBe(false)
  })

  it('treats a non-ApiError as not inactive', () => {
    expect(isContractInactiveError(new Error('network down'))).toBe(false)
  })
})
