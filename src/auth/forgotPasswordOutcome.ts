import { ApiError } from '../api/client'

/**
 * KAN-146 — Forgot Password Flow.
 *
 * FR2/NFR3: `POST /auth/forgot-password.php` (`api/openapi.yaml`) already
 * collapses "unknown e-mail, inactive account, mail-send failure" into one
 * uniform `200` (anti-enumeration, CB1) — but it still issues a distinct
 * `429` for a per-IP throttle (`cpal_ip_bloquee`, CB3) and a `400` for a
 * malformed body. The legacy PHP page (`forgot_password.php`) never
 * surfaces either of those as a different screen either (CB1: `$envoye =
 * true` is set unconditionally *before* the IP-block check even runs), and
 * this epic's own edge-case list is explicit that a *throttled* request
 * gets the identical confirmation too (`React-Password-Recovery-and-
 * Account-Management.md` §12). So every outcome this endpoint can produce
 * for a client-side-valid e-mail — success, 400, 401, 429, or any other
 * 4xx — must render the one "check your mailbox" confirmation; only a
 * genuine service failure (5xx, or a transport-level failure with no HTTP
 * response at all) is its own distinct bucket, since that is an
 * infrastructure fact, not an account fact, and isn't in FR2's collapsed
 * list.
 */
export type ForgotPasswordOutcome = 'confirmed' | 'serviceUnavailable'

export const FORGOT_PASSWORD_MESSAGES: Record<ForgotPasswordOutcome, string> = {
  confirmed:
    'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de lui être envoyé.',
  serviceUnavailable:
    'Le service est momentanément indisponible. Réessayez dans un instant.',
}

/**
 * Maps a thrown forgot-password failure to one of the two outcome buckets.
 * The success path never calls this — the caller sets `'confirmed'`
 * directly when the request does not throw.
 */
export function mapForgotPasswordOutcome(error: unknown): ForgotPasswordOutcome {
  if (!(error instanceof ApiError)) {
    // Transport-level failure (offline, DNS, CORS, an aborted request...).
    return 'serviceUnavailable'
  }
  if (error.status >= 500) {
    return 'serviceUnavailable'
  }
  // 429 (per-IP throttle), 400 (malformed body — FR1 already blocks an
  // invalid-format submit client-side, so unreachable in practice), or
  // anything else this endpoint might send: FR2 requires the identical
  // confirmation regardless, never a distinguishing branch.
  return 'confirmed'
}
