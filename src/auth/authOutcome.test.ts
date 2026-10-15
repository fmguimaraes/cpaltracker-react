import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import {
  AUTH_OUTCOME_MESSAGES,
  getAuthOutcomeMessage,
  mapAuthOutcome,
} from './authOutcome'

describe('mapAuthOutcome (FR7, FR8, NFR9)', () => {
  it('maps a 401 invalid_credentials ApiError to genericRejection', () => {
    const err = new ApiError(401, 'Adresse ou mot de passe incorrect.', 'invalid_credentials')
    expect(mapAuthOutcome(err)).toBe('genericRejection')
  })

  it('maps every anti-enumeration-collapsed 401 account state identically — unknown, soft-deleted, uninitialized-password, wrong-password, and locked all produce the same outcome', () => {
    // The real /api/v1 login endpoint never distinguishes these at the
    // status/code level (GAP4 is closed server-side — see authOutcome.ts) —
    // they are all, today, the literal same ApiError shape. This test
    // documents and guards that every one of them lands on the one neutral
    // bucket; it would fail if a future change special-cased any of them
    // (e.g. by having the client branch on a `reason` field the real API
    // doesn't even send).
    const accountStates = [
      'unknown-account',
      'soft-deleted',
      'uninitialized-password',
      'wrong-password',
      'locked',
    ]
    const outcomes = accountStates.map(() =>
      mapAuthOutcome(new ApiError(401, 'Adresse ou mot de passe incorrect.', 'invalid_credentials')),
    )
    expect(new Set(outcomes)).toEqual(new Set(['genericRejection']))
  })

  it('maps a 401 unauthorized ApiError (expired/invalid bearer token) to sessionExpired, distinct from invalid_credentials', () => {
    const err = new ApiError(401, 'Missing, invalid or expired token.', 'unauthorized')
    expect(mapAuthOutcome(err)).toBe('sessionExpired')
  })

  it('maps a 429 rate_limited ApiError to ipThrottle', () => {
    const err = new ApiError(429, 'Too many attempts from this connection. Try again later.', 'rate_limited')
    expect(mapAuthOutcome(err)).toBe('ipThrottle')
  })

  it('maps a 503 service_unavailable ApiError to serviceUnavailable', () => {
    const err = new ApiError(503, 'Le service est momentanément indisponible.', 'service_unavailable')
    expect(mapAuthOutcome(err)).toBe('serviceUnavailable')
  })

  it('maps any other 5xx to serviceUnavailable', () => {
    const err = new ApiError(500, 'Response encoding failed', 'internal_error')
    expect(mapAuthOutcome(err)).toBe('serviceUnavailable')
  })

  it('maps a non-ApiError (transport/network failure) to serviceUnavailable, never exposing the raw error', () => {
    expect(mapAuthOutcome(new TypeError('Failed to fetch'))).toBe('serviceUnavailable')
    expect(mapAuthOutcome('not even an Error')).toBe('serviceUnavailable')
  })

  it('falls back an unexpected 4xx (e.g. 400 invalid_body) to genericRejection rather than rendering raw backend text', () => {
    const err = new ApiError(400, 'Expected a JSON object with "email" and "password" string fields.', 'invalid_body')
    expect(mapAuthOutcome(err)).toBe('genericRejection')
  })
})

describe('getAuthOutcomeMessage (FR8 — neutral lockout copy)', () => {
  it('returns the mapped message, not the ApiError message, for a generic rejection', () => {
    const err = new ApiError(401, 'Invalid email or password.', 'invalid_credentials')
    expect(getAuthOutcomeMessage(err)).toBe('Adresse ou mot de passe incorrect.')
    expect(getAuthOutcomeMessage(err)).not.toBe(err.message)
  })

  it('the genericRejection/lockout copy never contains a digit (no remaining-minutes countdown)', () => {
    // Guards FR8 directly: if a regression reintroduced CB11/CB13's old
    // "...Réessayez dans N minutes..." countdown text for the locked branch,
    // this would fail.
    expect(AUTH_OUTCOME_MESSAGES.genericRejection).not.toMatch(/\d/)
  })

  it('the ipThrottle copy never contains a digit (no borrowed/guessed rate-limit window, NFR8)', () => {
    expect(AUTH_OUTCOME_MESSAGES.ipThrottle).not.toMatch(/\d/)
  })

  it('every outcome message is a non-empty, distinct string', () => {
    const messages = Object.values(AUTH_OUTCOME_MESSAGES)
    expect(messages.every((m) => m.length > 0)).toBe(true)
    expect(new Set(messages).size).toBe(messages.length)
  })
})
