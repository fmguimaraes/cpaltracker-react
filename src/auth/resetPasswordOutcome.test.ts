import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'
import {
  isTokenTerminalOutcome,
  mapResetPasswordOutcome,
} from './resetPasswordOutcome'

describe('mapResetPasswordOutcome (FR6, FR7)', () => {
  it.each([
    ['empty token', 'Lien incomplet. Reprenez le message reçu par e-mail.'],
    [
      'expired/unknown token',
      'Ce lien n\'est plus valable. Les liens expirent au bout de 15 minutes et ne servent qu\'une fois. Demandez-en un nouveau.',
    ],
    ['concurrently-consumed token', 'Ce lien vient d\'être utilisé. Demandez-en un nouveau.'],
  ])('maps a 401 invalid_token for %s to its own distinct, verbatim message', (_label, message) => {
    const mapped = mapResetPasswordOutcome(new ApiError(401, message, 'invalid_token'))
    expect(mapped).toEqual({ outcome: 'invalidToken', message })
  })

  it('treats invalidToken as token-terminal', () => {
    expect(isTokenTerminalOutcome('invalidToken')).toBe(true)
  })

  it('maps a 429 rate_limited (ip_bloquee, CB3) to the shared ipThrottle bucket, not the raw wire message', () => {
    const mapped = mapResetPasswordOutcome(
      new ApiError(429, 'Trop de tentatives depuis cette connexion. Réessayez plus tard.', 'rate_limited'),
    )
    expect(mapped).toEqual({ outcome: 'ipThrottle', message: AUTH_OUTCOME_MESSAGES.ipThrottle })
  })

  it('treats ipThrottle as token-terminal too (same compte === null branch as an invalid token)', () => {
    expect(isTokenTerminalOutcome('ipThrottle')).toBe(true)
  })

  it('maps a 400 weak_password to its own bucket, rendering the server\'s dynamic policy/HIBP text verbatim (FR6)', () => {
    const message =
      'Il faut au moins 12 caractères ; celui-ci en compte 5. Ce mot de passe figure dans des fuites de données publiques (1 234 apparitions). Choisissez-en un autre.'
    const mapped = mapResetPasswordOutcome(new ApiError(400, message, 'weak_password'))
    expect(mapped).toEqual({ outcome: 'weakPassword', message })
  })

  it('does not treat weakPassword as token-terminal (the form stays up for the user to fix)', () => {
    expect(isTokenTerminalOutcome('weakPassword')).toBe(false)
  })

  it('maps a bare 400 invalid_body (malformed request) to a generic, non-leaking invalidRequest bucket', () => {
    const mapped = mapResetPasswordOutcome(new ApiError(400, 'Bad request', 'invalid_body'))
    expect(mapped.outcome).toBe('invalidRequest')
    expect(mapped.message).toBe('Requête invalide.')
  })

  it('maps a 500 to serviceUnavailable', () => {
    const mapped = mapResetPasswordOutcome(new ApiError(500, 'Internal error'))
    expect(mapped).toEqual({
      outcome: 'serviceUnavailable',
      message: AUTH_OUTCOME_MESSAGES.serviceUnavailable,
    })
  })

  it('maps a 503 to serviceUnavailable', () => {
    const mapped = mapResetPasswordOutcome(
      new ApiError(503, 'Service unavailable', 'service_unavailable'),
    )
    expect(mapped.outcome).toBe('serviceUnavailable')
  })

  it('maps a non-ApiError (transport-level) failure to serviceUnavailable, never a raw Error#message', () => {
    const mapped = mapResetPasswordOutcome(new TypeError('Failed to fetch'))
    expect(mapped).toEqual({
      outcome: 'serviceUnavailable',
      message: AUTH_OUTCOME_MESSAGES.serviceUnavailable,
    })
  })

  it('does not treat serviceUnavailable as token-terminal (transient, the form stays up to retry)', () => {
    expect(isTokenTerminalOutcome('serviceUnavailable')).toBe(false)
  })
})
