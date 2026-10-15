import { describe, expect, it } from 'vitest'
import { buildLoginRedirectPath, sanitizeSuite } from './suite'

describe('sanitizeSuite (FR3)', () => {
  it('accepts a same-origin relative path starting with /', () => {
    expect(sanitizeSuite('/contracts/42')).toBe('/contracts/42')
  })

  it('drops an absolute URL to a third-party host (open-redirect attempt)', () => {
    expect(sanitizeSuite('https://evil.example.com/phish')).toBe('')
  })

  it('drops a value containing :// even if it starts with /', () => {
    expect(sanitizeSuite('/redirect?to=https://evil.example.com')).toBe('')
  })

  it('drops a value that does not start with /', () => {
    expect(sanitizeSuite('contracts/42')).toBe('')
  })

  it('drops null/undefined/empty to an empty string', () => {
    expect(sanitizeSuite(null)).toBe('')
    expect(sanitizeSuite(undefined)).toBe('')
    expect(sanitizeSuite('')).toBe('')
  })
})

describe('buildLoginRedirectPath (FR13)', () => {
  it('preserves the attempted path and query as a sanitized suite param', () => {
    expect(
      buildLoginRedirectPath({ pathname: '/contracts/42', search: '?tab=history' }),
    ).toBe('/login?suite=%2Fcontracts%2F42%3Ftab%3Dhistory')
  })

  it('falls back to a bare /login when the attempted path sanitizes to empty', () => {
    // pathname always starts with / in practice, but guard the fallback anyway
    expect(buildLoginRedirectPath({ pathname: '', search: '' })).toBe('/login')
  })
})
