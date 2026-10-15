import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'
import { FORGOT_PASSWORD_MESSAGES, mapForgotPasswordOutcome } from './forgotPasswordOutcome'

describe('mapForgotPasswordOutcome (FR2, NFR3)', () => {
  // Enumeration-safety regression guard: every outcome the real
  // /auth/forgot-password.php endpoint can produce for an unknown,
  // inactive, per-account-throttled, or mail-failed account must map to the
  // same bucket as a genuine success — so the UI can never branch on which
  // one happened. A per-IP 429 and a malformed-body 400 are NOT part of
  // this set (review gate round 1, B1) — see forgotPasswordOutcome.ts's
  // docblock for why collapsing them would be a UX regression, not an
  // anti-enumeration improvement.
  it.each([
    ['a 404 response (not documented, but account-state-neutral)', new ApiError(404, 'Not found')],
    ['a 401 response (not documented either)', new ApiError(401, 'Unauthorized', 'unauthorized')],
  ])('maps %s to the same "confirmed" bucket as success', (_label, error) => {
    expect(mapForgotPasswordOutcome(error)).toBe('confirmed')
  })

  it('maps a 429 per-IP-throttle response (CB3) to its own ipThrottle bucket, distinct from confirmed', () => {
    expect(mapForgotPasswordOutcome(new ApiError(429, 'Too many requests', 'rate_limited'))).toBe(
      'ipThrottle',
    )
  })

  it('reuses the exact same ipThrottle copy as login\'s own ipThrottle bucket (one canonical "too many attempts" string app-wide)', () => {
    expect(FORGOT_PASSWORD_MESSAGES.ipThrottle).toBe(AUTH_OUTCOME_MESSAGES.ipThrottle)
  })

  it('maps a 400 malformed-body response to its own invalidRequest bucket, distinct from confirmed', () => {
    expect(mapForgotPasswordOutcome(new ApiError(400, 'Bad request', 'invalid_body'))).toBe(
      'invalidRequest',
    )
  })

  it('maps a 500 response to serviceUnavailable, distinct from every other outcome', () => {
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

  it('exposes exactly four outcome buckets', () => {
    const outcomes = new Set([
      mapForgotPasswordOutcome(new ApiError(404, 'x')),
      mapForgotPasswordOutcome(new ApiError(400, 'x')),
      mapForgotPasswordOutcome(new ApiError(429, 'x')),
      mapForgotPasswordOutcome(new ApiError(500, 'x')),
      mapForgotPasswordOutcome(new Error('x')),
    ])
    expect(outcomes).toEqual(
      new Set(['confirmed', 'invalidRequest', 'ipThrottle', 'serviceUnavailable']),
    )
  })
})
