import { ApiError } from '../api/client'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'

/**
 * KAN-148 — Reset Password Flow (FR6, FR7).
 *
 * `POST /api/v1/auth/reset-password.php` (`cpal_valider_jeton_reset` +
 * `cpal_terminer_reinitialisation`, `password_recovery_logic.php`) has no
 * separate "display" phase — token + new password are validated together
 * in one call — and its error shapes split into two kinds this mapper
 * treats differently:
 *
 * 1. `401 invalid_token` covers three link-state cases (empty, expired,
 *    already-used-concurrently) that all share the same status/code but
 *    carry distinct, already-crafted French text
 *    (`password_recovery_logic.php`'s `cpal_valider_jeton_reset`/
 *    `cpal_terminer_reinitialisation`: "Lien incomplet...", "Ce lien n'est
 *    plus valable...", "Ce lien vient d'être utilisé..."). Unlike
 *    `authOutcome.ts`'s account-rejection collapsing (where the backend
 *    message is explicitly NOT a stable contract and must never be shown
 *    raw), FR7 requires these three to render distinctly, and the message
 *    is about link/token state, not account existence — there is no
 *    enumeration risk in showing it verbatim, and no other signal (status
 *    or code) exists to key a distinct branch on instead. Same reasoning
 *    for `429 rate_limited` (`ip_bloquee`, CB3) — not account-related
 *    either — except there the shared `ipThrottle` copy (`authOutcome.ts`)
 *    is reused rather than the raw string, for the same one-canonical-
 *    string-app-wide reason `forgotPasswordOutcome.ts` does.
 * 2. `400 weak_password` (FR6) is the NIST/HIBP policy rejection
 *    (`cpal_valider_motdepasse`, `password_policy.php`) — dynamic text
 *    (character counts, HIBP breach counts) that cannot be hardcoded
 *    client-side (NFR7) and must be rendered exactly as the server sends
 *    it, per FR6's explicit "without re-implementing the policy
 *    client-side."
 *
 * A bare `400 invalid_body` (malformed request — defensive only, this
 * screen always sends a well-formed body) and any other undocumented
 * status fall back to a generic, non-leaking `invalidRequest` message.
 */
export type ResetPasswordOutcome =
  | 'invalidToken'
  | 'ipThrottle'
  | 'weakPassword'
  | 'invalidRequest'
  | 'serviceUnavailable'

export interface MappedResetPasswordOutcome {
  outcome: ResetPasswordOutcome
  message: string
}

const GENERIC_INVALID_REQUEST_MESSAGE = 'Requête invalide.'

/**
 * `invalidToken` and `ipThrottle` both mean the token itself can't be
 * redeemed (dead, expired, consumed, or the caller's IP is blocked) —
 * `ResetPassword.tsx` treats both as terminal (hides the form, offers a
 * link to request a new one), the same branch `reset_password.php` itself
 * takes when `$compte === null`.
 */
export function isTokenTerminalOutcome(outcome: ResetPasswordOutcome): boolean {
  return outcome === 'invalidToken' || outcome === 'ipThrottle'
}

export function mapResetPasswordOutcome(error: unknown): MappedResetPasswordOutcome {
  if (!(error instanceof ApiError)) {
    return { outcome: 'serviceUnavailable', message: AUTH_OUTCOME_MESSAGES.serviceUnavailable }
  }
  if (error.status >= 500) {
    return { outcome: 'serviceUnavailable', message: AUTH_OUTCOME_MESSAGES.serviceUnavailable }
  }
  if (error.status === 429) {
    return { outcome: 'ipThrottle', message: AUTH_OUTCOME_MESSAGES.ipThrottle }
  }
  if (error.status === 401) {
    return { outcome: 'invalidToken', message: error.message }
  }
  if (error.status === 400 && error.code === 'weak_password') {
    return { outcome: 'weakPassword', message: error.message }
  }
  return { outcome: 'invalidRequest', message: GENERIC_INVALID_REQUEST_MESSAGE }
}
