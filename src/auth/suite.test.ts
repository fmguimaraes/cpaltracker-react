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

  it('drops a protocol-relative value that the browser would resolve off-origin', () => {
    expect(sanitizeSuite('//evil.example.com/phish')).toBe('')
  })

  it('drops a backslash value the browser treats as protocol-relative', () => {
    expect(sanitizeSuite('/\\evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('\\/evil.example.com/phish')).toBe('')
  })

  it('drops a value whose stripped control characters reveal a protocol-relative host', () => {
    expect(sanitizeSuite('/\t/evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/\n/evil.example.com/phish')).toBe('')
  })

  it('still accepts a same-origin path containing query and hash', () => {
    expect(sanitizeSuite('/contracts/42?tab=history#top')).toBe(
      '/contracts/42?tab=history#top',
    )
  })

  it('drops values that resolve same-origin but normalize to a protocol-relative path (review gate, round 2)', () => {
    // WHATWG dot-segment removal collapses each of these to a pathname
    // starting with "//" even though the *input* resolves same-origin —
    // checking only the input's origin (round 1's fix) is not enough.
    expect(sanitizeSuite('/.//evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/..//evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/a/..//evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/%2e//evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/%2E%2E//evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/./\\evil.example.com/phish')).toBe('')
    expect(sanitizeSuite('/\t.//evil.example.com/phish')).toBe('')
  })

  it('never returns a value that is anything other than a same-origin, path-absolute reference', () => {
    // The real security property (review gate, round 3): the output must
    // stay same-origin no matter what it is re-parsed against, and must
    // never start with "//" or "/\" (both of which the WHATWG parser would
    // treat as protocol-relative). This is deliberately not an idempotence
    // check (sanitizeSuite(sanitizeSuite(x)) === sanitizeSuite(x) does not
    // hold in general — e.g. backslash normalization can produce a "://" in
    // the output that the raw-string pre-check then rejects on a second
    // pass, always in the safe direction) — assert the actual invariant
    // instead of a proxy for it.
    const candidates = [
      '/contracts/42',
      '/contracts/42?tab=history#top',
      '//evil.example.com/phish',
      '/.//evil.example.com/phish',
      '/%2e//evil.example.com/phish',
      '/./\\evil.example.com/phish',
      'https://evil.example.com/phish',
      '',
      'contracts/42',
    ]
    for (const candidate of candidates) {
      const sanitized = sanitizeSuite(candidate)
      if (sanitized === '') continue
      expect(sanitized.startsWith('/')).toBe(true)
      expect(sanitized.startsWith('//')).toBe(false)
      expect(sanitized.startsWith('/\\')).toBe(false)
      expect(new URL(sanitized, 'http://other.test').host).toBe('other.test')
    }
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

  // KAN-156 (FR11/FR12): the optional notice param, appended alongside suite.
  it('appends a notice param alongside suite when both are present', () => {
    expect(
      buildLoginRedirectPath({ pathname: '/contracts/42', search: '' }, 'session-expired'),
    ).toBe('/login?suite=%2Fcontracts%2F42&notice=session-expired')
  })

  it('renders a bare /login?notice=... when there is no suite to preserve', () => {
    expect(buildLoginRedirectPath({ pathname: '', search: '' }, 'logged-out')).toBe(
      '/login?notice=logged-out',
    )
  })

  it('omits notice entirely when not provided or null, unchanged from the FR13-only shape', () => {
    expect(buildLoginRedirectPath({ pathname: '/contracts/42', search: '' })).toBe(
      '/login?suite=%2Fcontracts%2F42',
    )
    expect(
      buildLoginRedirectPath({ pathname: '/contracts/42', search: '' }, null),
    ).toBe('/login?suite=%2Fcontracts%2F42')
  })
})
