import { ApiError } from '../api/client'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'

/**
 * KAN-146 — Forgot Password Flow.
 *
 * Review gate round 1 (B1): the first version of this mapper collapsed
 * EVERY non-5xx response, including a per-IP `429`, into the one "check
 * your mailbox" confirmation, on the (wrong) claim that the legacy
 * `forgot_password.php` already does the same. It doesn't — read directly
 * (`cpaltracker.web/forgot_password.php` lines ~34-45): `$envoye = true` is
 * set only in the page's final `else` branch, which runs *after* its
 * `cpal_ip_bloquee($pdo)` check (CB3); a blocked IP takes the `elseif`
 * branch above it and gets its own distinct "Trop de tentatives..."
 * message instead. `api/v1/auth/forgot-password.php`'s own header comment
 * confirms the same split deliberately carries over to `/api/v1`: "The two
 * cases that DO get a distinct response are a malformed request body (400)
 * and an IP already blocked by cpal_ip_bloquee() (429, CB3) — neither
 * reveals anything about a specific account, so neither violates
 * anti-enumeration." Collapsing CB3 into the confirmation (as the first
 * version did) isn't an anti-enumeration improvement — it's a *regression*:
 * a legitimately-throttled visitor is told an e-mail is on its way when
 * none will ever arrive, with nothing telling them to wait, where the
 * legacy page (and `/api/v1`) both already tell them exactly that.
 *
 * Only `cpal_demander_reinitialisation()` (`password_recovery_logic.php`)
 * — reached solely via that final `else`, after the IP check already
 * passed — is genuinely anti-enumeration-collapsed: an unknown/soft-deleted
 * account, an account over its own per-account hourly cap (CB4), and a mail
 * -send failure all `return` from it identically, with nothing signalled
 * back to the caller either way (CB1). So the real mapping has four
 * buckets, matching the four distinct wire shapes `/api/v1` documents:
 * success (200) and any other unexpected 4xx this endpoint might send →
 * `confirmed` (an account-existence fact, genuinely collapsed); `400`
 * (malformed body — FR1 blocks this client-side, so defensive only) →
 * `invalidRequest`; `429` (CB3, per-IP, not account-related) →
 * `ipThrottle`, reusing the exact copy login's own `ipThrottle` bucket uses
 * (`authOutcome.ts`) rather than inventing new text or hardcoding a
 * server-owned retry window (NFR7); and a genuine 5xx/transport failure →
 * `serviceUnavailable`, same shared copy as every other outcome mapper in
 * this app.
 */
export type ForgotPasswordOutcome =
  | 'confirmed'
  | 'invalidRequest'
  | 'ipThrottle'
  | 'serviceUnavailable'

export const FORGOT_PASSWORD_MESSAGES: Record<ForgotPasswordOutcome, string> = {
  confirmed:
    'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de lui être envoyé.',
  invalidRequest: 'Adresse e-mail invalide.',
  ipThrottle: AUTH_OUTCOME_MESSAGES.ipThrottle,
  serviceUnavailable: AUTH_OUTCOME_MESSAGES.serviceUnavailable,
}

/**
 * Maps a thrown forgot-password failure to one of the four outcome
 * buckets. The success path never calls this — the caller sets
 * `'confirmed'` directly when the request does not throw.
 */
export function mapForgotPasswordOutcome(error: unknown): ForgotPasswordOutcome {
  if (!(error instanceof ApiError)) {
    // Transport-level failure (offline, DNS, CORS, an aborted request...).
    return 'serviceUnavailable'
  }
  if (error.status >= 500) {
    return 'serviceUnavailable'
  }
  if (error.status === 429) {
    return 'ipThrottle'
  }
  if (error.status === 400) {
    return 'invalidRequest'
  }
  // Any other unexpected status (401, 404, 405...) this endpoint has no
  // documented reason to send — fall back to the generic confirmation
  // rather than a raw backend string, consistent with every outcome that
  // is genuinely tied to account state.
  return 'confirmed'
}
