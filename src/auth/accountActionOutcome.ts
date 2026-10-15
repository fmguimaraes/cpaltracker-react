import { ApiError } from '../api/client'
import { AUTH_OUTCOME_MESSAGES } from './authOutcome'

/**
 * KAN-152 — Account Self-Service (FR11-FR15).
 *
 * `PATCH /api/v1/account.php` (`account_logic.php`'s
 * `cpal_compte_changer_motdepasse`/`cpal_compte_changer_telephone`/
 * `cpal_compte_changer_mail`) shares one error shape across all three
 * actions:
 * - `400 invalid_field` — every domain rejection (password mismatch/
 *   same-as-current/policy/HIBP, phone format, e-mail format/duplicate),
 *   joined into one dynamic string. FR12/FR13/FR14 all require rendering
 *   this verbatim rather than re-implementing the policy/format rules
 *   client-side, the same reasoning `resetPasswordOutcome.ts`'s
 *   `weakPassword` bucket already applies to the sibling reset endpoint.
 * - `401 invalid_credentials` — the `currentPassword` field itself was
 *   wrong. A fixed copy is used (not the wire text) — unlike
 *   `invalid_field`, this message has no dynamic content, so there is no
 *   reason to depend on the backend's exact string staying stable.
 * - `403 must_change_password` — only reachable if the UI ever let a
 *   `mustChangePassword` account submit a non-password action, which FR10
 *   already prevents by hiding those panels; kept as a defensive fallback,
 *   not a reachable path in normal use.
 * - `429 rate_limited` — not actually emitted by this endpoint today
 *   (GAP1, stack-decision.md §9's forgot-password note names the sibling
 *   gap; this is the account-password-check equivalent, logged in
 *   `React-Password-Recovery-and-Account-Management.md` §14). FR15 still
 *   requires handling it consistently, so the shared `ipThrottle` copy is
 *   wired defensively for the day the backend adds one.
 * - `400 invalid_body` / anything else undocumented — defensive fallback,
 *   not reachable through this app's own well-formed requests.
 * - `5xx`/transport failure — `serviceUnavailable`, same shared copy as
 *   every other outcome mapper in this app.
 */
export type AccountActionOutcome =
  | 'invalidField'
  | 'invalidCurrentPassword'
  | 'mustChangePassword'
  | 'ipThrottle'
  | 'invalidRequest'
  | 'serviceUnavailable'

export interface MappedAccountActionOutcome {
  outcome: AccountActionOutcome
  message: string
}

const INVALID_CURRENT_PASSWORD_MESSAGE = 'Mot de passe actuel incorrect.'
const MUST_CHANGE_PASSWORD_MESSAGE =
  'Vous devez changer votre mot de passe avant de modifier ces informations.'
const GENERIC_INVALID_REQUEST_MESSAGE = 'Requête invalide.'

export function mapAccountActionOutcome(error: unknown): MappedAccountActionOutcome {
  if (!(error instanceof ApiError)) {
    return { outcome: 'serviceUnavailable', message: AUTH_OUTCOME_MESSAGES.serviceUnavailable }
  }
  if (error.status >= 500) {
    return { outcome: 'serviceUnavailable', message: AUTH_OUTCOME_MESSAGES.serviceUnavailable }
  }
  if (error.status === 429) {
    return { outcome: 'ipThrottle', message: AUTH_OUTCOME_MESSAGES.ipThrottle }
  }
  if (error.status === 403) {
    return { outcome: 'mustChangePassword', message: MUST_CHANGE_PASSWORD_MESSAGE }
  }
  if (error.status === 401 && error.code === 'invalid_credentials') {
    return { outcome: 'invalidCurrentPassword', message: INVALID_CURRENT_PASSWORD_MESSAGE }
  }
  // A 401 `unauthorized` (real session loss — a genuinely expired/revoked
  // token, not a wrong `currentPassword`) is already handled by
  // `client.ts`'s shared session-loss interceptor before this mapper ever
  // runs; falling through to the generic bucket here avoids mislabeling
  // that case as a wrong-password rejection.
  if (error.status === 401) {
    return { outcome: 'invalidRequest', message: GENERIC_INVALID_REQUEST_MESSAGE }
  }
  if (error.status === 400 && error.code === 'invalid_field') {
    return { outcome: 'invalidField', message: error.message }
  }
  return { outcome: 'invalidRequest', message: GENERIC_INVALID_REQUEST_MESSAGE }
}
