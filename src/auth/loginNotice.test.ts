import { describe, expect, it } from 'vitest'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'
import { LOGIN_NOTICE_MESSAGES, parseLoginNotice } from './loginNotice'

describe('parseLoginNotice (KAN-156, FR10/FR11)', () => {
  it('accepts the two known notice values', () => {
    expect(parseLoginNotice('logged-out')).toBe('logged-out')
    expect(parseLoginNotice('session-expired')).toBe('session-expired')
  })

  it('rejects null, an empty string, and any unrecognized value', () => {
    expect(parseLoginNotice(null)).toBeNull()
    expect(parseLoginNotice('')).toBeNull()
    expect(parseLoginNotice('something-else')).toBeNull()
    // Guards against a future `?notice=` value being rendered unsanitized
    // (e.g. XSS via an unvalidated query string driving copy lookup).
    expect(parseLoginNotice('<script>alert(1)</script>')).toBeNull()
  })
})

describe('LOGIN_NOTICE_MESSAGES (FR11)', () => {
  it('reuses authOutcome.ts\'s sessionExpired copy for session-expired, rather than inventing new copy', () => {
    expect(LOGIN_NOTICE_MESSAGES['session-expired']).toBe(
      AUTH_OUTCOME_MESSAGES.sessionExpired,
    )
  })

  it('has distinct, non-empty copy for logged-out', () => {
    expect(LOGIN_NOTICE_MESSAGES['logged-out']).toBeTruthy()
    expect(LOGIN_NOTICE_MESSAGES['logged-out']).not.toBe(
      LOGIN_NOTICE_MESSAGES['session-expired'],
    )
  })
})
