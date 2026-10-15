import { LOGIN_PATH } from './paths'

/**
 * FR3 — the `suite` return-target is accepted only when it resolves to a
 * same-origin path. `login.php`'s own CB2 check (`startsWith('/') &&
 * !includes('://')`) is not sufficient on its own: the browser still
 * resolves protocol-relative values (`//evil.com`), backslash tricks
 * (`/\evil.com` — a browser treats `\` as `/`), and values containing
 * stripped control characters (`/\t/evil.com`) to a different origin, which
 * is a real open redirect (review gate, KAN-149 round 1). Resolve against
 * the current origin with the URL parser itself and require the result to
 * still be same-origin, rather than pattern-matching the raw string.
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

  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

/**
 * FR13 — builds the `/login?suite=<attempted URL>` path a protected route
 * redirects an anonymous visitor to, replicating CB32's
 * `login.php?suite=<urlencoded current REQUEST_URI>` behavior. The attempted
 * location is always same-origin by construction, but it is still run
 * through `sanitizeSuite` for defense in depth.
 */
export function buildLoginRedirectPath(location: {
  pathname: string
  search: string
}): string {
  const target = sanitizeSuite(`${location.pathname}${location.search}`)
  return target ? `${LOGIN_PATH}?suite=${encodeURIComponent(target)}` : LOGIN_PATH
}
