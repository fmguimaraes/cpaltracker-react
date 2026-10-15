import { AUTH_OUTCOME_MESSAGES } from './authOutcome'

/**
 * KAN-156 — the query-param-driven "why am I back at /login" indicator shown
 * once after either an explicit logout (FR10) or an involuntary session-loss
 * drop (FR11/FR12). Centralized here in the same single-mechanism style as
 * `suite.ts`'s `sanitizeSuite`/`buildLoginRedirectPath`, so `AuthContext`
 * (producer), `RequireAuth`/`buildLoginRedirectPath` (redirect builder) and
 * `Login` (renderer) all agree on the same two values and the same param
 * name instead of each inventing their own.
 */
export type LoginNotice = 'logged-out' | 'session-expired'

const LOGIN_NOTICES: ReadonlySet<string> = new Set<LoginNotice>([
  'logged-out',
  'session-expired',
])

/** Validates an arbitrary `?notice=` query value against the known set. */
export function parseLoginNotice(value: string | null): LoginNotice | null {
  return value !== null && LOGIN_NOTICES.has(value) ? (value as LoginNotice) : null
}

/**
 * User-facing copy per notice.
 *
 * `session-expired` deliberately reuses `authOutcome.ts`'s `sessionExpired`
 * copy (KAN-155) rather than inventing new wording — FR11's "session-expired
 * copy" requirement is exactly the "token invalidated" bucket that mapping
 * already defines.
 */
export const LOGIN_NOTICE_MESSAGES: Record<LoginNotice, string> = {
  'logged-out': 'You have been signed out.',
  'session-expired': AUTH_OUTCOME_MESSAGES.sessionExpired,
}
