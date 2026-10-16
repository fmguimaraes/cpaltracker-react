import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { eligibilityFromError } from './eligibility'

describe('eligibilityFromError (KAN-159 FR3, NFR4)', () => {
  it('recognizes the API\'s own 403 "forbidden" MAIN-only signal and carries its message verbatim', () => {
    const error = new ApiError(403, 'Device pilotage is limited to MAIN contracts.', 'forbidden')

    expect(eligibilityFromError(error)).toEqual({
      status: 'ineligible',
      message: 'Device pilotage is limited to MAIN contracts.',
    })
  })

  it('treats a 403 with a different code as unknown (e.g. mustChangePassword), never as ineligibility', () => {
    const error = new ApiError(403, 'Forbidden', 'must_change_password')

    expect(eligibilityFromError(error)).toEqual({ status: 'unknown' })
  })

  it('treats a 404 (device not found / not authorized) as unknown, not ineligible', () => {
    const error = new ApiError(404, 'Device not found.', 'not_found')

    expect(eligibilityFromError(error)).toEqual({ status: 'unknown' })
  })

  it('treats a non-ApiError as unknown', () => {
    expect(eligibilityFromError(new Error('network down'))).toEqual({ status: 'unknown' })
  })

  it('treats a 403 "forbidden" missing a message as still ineligible, carrying whatever message is present', () => {
    const error = new ApiError(403, '', 'forbidden')

    expect(eligibilityFromError(error)).toEqual({ status: 'ineligible', message: '' })
  })
})
