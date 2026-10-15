import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { mapForgotPasswordOutcome } from './forgotPasswordOutcome'

describe('mapForgotPasswordOutcome (FR2, NFR3)', () => {
  // Enumeration-safety regression guard: every outcome the real
  // /auth/forgot-password.php endpoint can produce for an unknown,
  // inactive, per-IP-throttled, or mail-failed account must map to the
  // same bucket as a genuine success — so the UI can never branch on which
  // one happened.
  it.each([
    ['a 400 malformed-body response', new ApiError(400, 'Bad request', 'invalid_body')],
    ['a 401 response (not documented, but must not leak either)', new ApiError(401, 'Unauthorized', 'unauthorized')],
    ['a 404 response', new ApiError(404, 'Not found')],
    ['a 429 per-IP-throttle response (CB3)', new ApiError(429, 'Too many requests', 'rate_limited')],
  ])('maps %s to the same "confirmed" bucket as success', (_label, error) => {
    expect(mapForgotPasswordOutcome(error)).toBe('confirmed')
  })

  it('maps a 500 response to serviceUnavailable, distinct from every account-related outcome', () => {
    expect(mapForgotPasswordOutcome(new ApiError(500, 'Internal error'))).toBe(
      'serviceUnavailable',
    )
  })

  it('maps a 503 response to serviceUnavailable', () => {
    expect(
      mapForgotPasswordOutcome(new ApiError(503, 'Service unavailable', 'service_unavailable')),
    ).toBe('serviceUnavailable')
  })

  it('maps a non-ApiError (transport-level) failure to serviceUnavailable, never to a raw Error#message', () => {
    expect(mapForgotPasswordOutcome(new TypeError('Failed to fetch'))).toBe(
      'serviceUnavailable',
    )
  })

  it('exposes exactly two outcome buckets', () => {
    const outcomes = new Set([
      mapForgotPasswordOutcome(new ApiError(400, 'x')),
      mapForgotPasswordOutcome(new ApiError(429, 'x')),
      mapForgotPasswordOutcome(new ApiError(500, 'x')),
      mapForgotPasswordOutcome(new Error('x')),
    ])
    expect(outcomes).toEqual(new Set(['confirmed', 'serviceUnavailable']))
  })
})
