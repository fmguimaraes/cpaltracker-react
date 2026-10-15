import { LOGIN_PATH } from './paths'

/**
 * FR3 — the `suite` return-target is accepted only when it is a same-origin
 * relative path: it must start with `/` and contain no `://`. Anything else
 * (an absolute URL, a bare host, empty/missing) is dropped to `''`, exactly
 * replicating `login.php`'s own CB2 check (`react-auth-and-session.md` FR3;
 * `Auth-and-Session.md` CB2, `login.php` lines 36-40) — this neutralizes an
 * open redirect to a third-party host via the `suite` param.
 */
export function sanitizeSuite(suite: string | null | undefined): string {
  if (!suite) return ''
  if (!suite.startsWith('/') || suite.includes('://')) return ''
  return suite
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
