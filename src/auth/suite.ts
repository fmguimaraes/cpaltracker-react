import type { LoginNotice } from './loginNotice'
import { LOGIN_PATH } from './paths'

/**
 * FR3 — the `suite` return-target is accepted only when it resolves to a
 * same-origin path. `login.php`'s own CB2 check (`startsWith('/') &&
 * !includes('://')`) is not sufficient on its own: the browser still
 * resolves protocol-relative values (`//evil.com`), backslash tricks
 * (`/\evil.com` — a browser treats `\` as `/`), and values containing
 * stripped control characters (`/\t/evil.com`) to a different origin
 * (review gate, KAN-149 round 1).
 *
 * Checking the *input*'s resolved origin is also not sufficient on its own
 * (round 2): WHATWG dot-segment removal can collapse an in-origin-looking
 * path into a protocol-relative one during normalization — `/.//evil.com`,
 * `/..//evil.com` and their `%2e`-encoded or backslash/control-character
 * variants all resolve same-origin yet *normalize* to a pathname starting
 * with `//`, which the caller would then navigate to as if it were a plain
 * path. The output has to be re-checked, not just the input: reject
 * anything whose normalized pathname starts with `//` (i.e. would itself
 * parse as protocol-relative if used as a fresh URL).
 */
export function sanitizeSuite(suite: string | null | undefined): string {
  if (!suite) return ''
  if (!suite.startsWith('/') || suite.includes('://')) return ''

  let resolved: URL
  try {
    resolved = new URL(suite, window.location.origin)
  } catch {
    return ''
  }
  if (resolved.origin !== window.location.origin) return ''
  if (resolved.pathname.startsWith('//')) return ''

  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

/**
 * FR13 — builds the `/login?suite=<attempted URL>` path a protected route
 * redirects an anonymous visitor to, replicating CB32's
 * `login.php?suite=<urlencoded current REQUEST_URI>` behavior. The attempted
 * location is always same-origin by construction, but it is still run
 * through `sanitizeSuite` for defense in depth.
 *
 * KAN-156 (FR11/FR12) adds an optional `notice`, appended as a second query
 * param (`&notice=<value>`) rather than a second redirect builder, so
 * `RequireAuth`'s single existing `status === 'anonymous'` branch — already
 * reused unmodified for the FR12 "any 401 routes to login with suite
 * preserved" requirement — can also carry the FR11 session-expired
 * indicator, with no second open-redirect-protected code path to keep in
 * sync with this one.
 */
export function buildLoginRedirectPath(
  location: { pathname: string; search: string },
  notice?: LoginNotice | null,
): string {
  const target = sanitizeSuite(`${location.pathname}${location.search}`)
  const params = new URLSearchParams()
  if (target) params.set('suite', target)
  if (notice) params.set('notice', notice)
  const query = params.toString()
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH
}
