import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'
import { mapAccountActionOutcome } from './accountActionOutcome'

describe('mapAccountActionOutcome (FR11-FR15)', () => {
  it('maps a 400 invalid_field to its own bucket, rendering the server\'s dynamic rejection text verbatim', () => {
    const message = 'Les deux saisies diffèrent.'
    const mapped = mapAccountActionOutcome(new ApiError(400, message, 'invalid_field'))
    expect(mapped).toEqual({ outcome: 'invalidField', message })
  })

  it('renders a joined multi-reason invalid_field message verbatim too (e.g. policy + HIBP)', () => {
    const message =
      'Il faut au moins 12 caractères ; celui-ci en compte 5. Les suites de clavier ou de chiffres sont devinées immédiatement.'
    const mapped = mapAccountActionOutcome(new ApiError(400, message, 'invalid_field'))
    expect(mapped.message).toBe(message)
  })

  it('maps a 401 invalid_credentials (wrong currentPassword) to a fixed, non-wire message', () => {
    const mapped = mapAccountActionOutcome(
      new ApiError(401, 'Mot de passe actuel incorrect.', 'invalid_credentials'),
    )
    expect(mapped).toEqual({ outcome: 'invalidCurrentPassword', message: 'Mot de passe actuel incorrect.' })
  })

  it('does not mislabel a real session-loss 401 unauthorized as a wrong-current-password rejection', () => {
    const mapped = mapAccountActionOutcome(
      new ApiError(401, 'Missing, invalid or expired token.', 'unauthorized'),
    )
    expect(mapped.outcome).not.toBe('invalidCurrentPassword')
  })

  it('maps a 403 must_change_password to its own defensive bucket', () => {
    const mapped = mapAccountActionOutcome(
      new ApiError(403, 'You must change your password before using this endpoint.', 'must_change_password'),
    )
    expect(mapped.outcome).toBe('mustChangePassword')
  })

  it('maps a 429 (GAP1, not live today but handled defensively) to the shared ipThrottle bucket', () => {
    const mapped = mapAccountActionOutcome(new ApiError(429, 'Too many requests', 'rate_limited'))
    expect(mapped).toEqual({ outcome: 'ipThrottle', message: AUTH_OUTCOME_MESSAGES.ipThrottle })
  })

  it('maps a bare 400 invalid_body to a generic, defensive invalidRequest bucket', () => {
    const mapped = mapAccountActionOutcome(new ApiError(400, 'Bad request', 'invalid_body'))
    expect(mapped.outcome).toBe('invalidRequest')
  })

  it('maps a 500/503 to serviceUnavailable', () => {
    expect(mapAccountActionOutcome(new ApiError(500, 'x')).outcome).toBe('serviceUnavailable')
    expect(mapAccountActionOutcome(new ApiError(503, 'x', 'service_unavailable')).outcome).toBe(
      'serviceUnavailable',
    )
  })

  it('maps a non-ApiError (transport-level) failure to serviceUnavailable', () => {
    const mapped = mapAccountActionOutcome(new TypeError('Failed to fetch'))
    expect(mapped).toEqual({
      outcome: 'serviceUnavailable',
      message: AUTH_OUTCOME_MESSAGES.serviceUnavailable,
    })
  })
})
