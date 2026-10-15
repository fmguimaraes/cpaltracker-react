import { ApiError } from '../api/client'

/**
 * KAN-155 — Auth Outcome Messaging & Lockout UX.
 *
 * Central outcome→copy mapping for `/api/v1` auth responses (FR7, FR8,
 * NFR9). Built off `ApiError`'s `status`/`code` fields only — never on
 * `message` string-matching — because the real API's own message text is
 * not a stable contract (e.g. `rate_limited` is sent in English today while
 * every other auth error is French; see `api/v1/auth/login.php`) and because
 * displaying the raw backend message verbatim would re-introduce exactly
 * the kind of distinguishing detail anti-enumeration is meant to withhold.
 *
 * Every branch below is backed by a real, currently-emitted `/api/v1`
 * status/code combination (`api/v1/auth/login.php`, `api/openapi.yaml`'s
 * `/auth/login.php` operation) — see the per-branch comments.
 */

/**
 * FR7/FR8 outcome buckets. Deliberately only four: there is no
 * `accountLockout` bucket distinct from `genericRejection` — see the
 * `genericRejection` comment in `mapAuthOutcome` for why that is a deliberate
 * mapping decision, not an oversight.
 */
export type AuthOutcome =
  | 'genericRejection'
  | 'sessionExpired'
  | 'serviceUnavailable'
  | 'ipThrottle'

/**
 * User-facing copy per outcome (NFR9 — French copy preserved from the
 * replicated CB-n behavior, except where FR8 supersedes it).
 */
export const AUTH_OUTCOME_MESSAGES: Record<AuthOutcome, string> = {
  // CB9 (`login.php` lines 74, 78, 89, 107) / the API's own 401
  // `invalid_credentials` body (`api/v1/auth/login.php` line 116) — same
  // string, word for word. FR8: this exact branch and message is also what
  // renders for a new-lockout or still-locked account (see the comment
  // below) — a neutral, no-countdown, existence-blind message by
  // construction, not by coincidence.
  genericRejection: 'Adresse ou mot de passe incorrect.',

  // CB3's text (`login.php` line 46), repointed per stack-decision.md §6:
  // FR9's literal CSRF-failure trigger does not exist in this bearer-token
  // architecture (no ambient cookie, nothing for a forged cross-site request
  // to ride on). The real equivalent condition for "the credential this
  // screen needs is no longer valid" is a 401 with code `unauthorized`
  // ("Missing, invalid or expired token.", e.g. `api/v1/account.php` line
  // 139, `cpal_api_require_auth_error()` callers) — i.e. token
  // invalidation/expiry on an *authenticated* request. `POST
  // /auth/login.php` itself never requires a token (`security: []` in
  // `openapi.yaml`) so it can never return this code; this branch exists for
  // any other `/api/v1` caller that reuses this same mapping function (e.g.
  // a future authenticated-request outcome handler), kept here so there is
  // exactly one outcome→copy mapping in the app, not two.
  sessionExpired: 'Votre session a expiré. Rechargez la page et réessayez.',

  // CB17's text, word for word (`auth.php` line 605) — also the API's own
  // 503 `service_unavailable` body today (`api/v1/auth/login.php` lines
  // 109-113, 136-140). Also used as the safe fallback for a non-`ApiError`
  // failure (network/CORS/offline) and for any 5xx this endpoint doesn't
  // explicitly document, so a transport-level failure is never shown as if
  // it were a credentials rejection.
  serviceUnavailable:
    'Le service est momentanément indisponible. Réessayez dans un instant.',

  // CB5's concept (`login.php` lines 51-54), adapted: the real API's 429
  // `rate_limited` response (`api/v1/auth/login.php` lines 88-96) carries no
  // remaining-minutes figure at all (unlike the legacy PHP page, which
  // interpolated `LOGIN_IP_WINDOW_MINUTES`), so the frontend has nothing to
  // report and must not hardcode the backend's current default window to
  // fake one — NFR8 forbids the UI designing behavior/copy around a
  // client-side guess at the server's rate-limit state.
  ipThrottle: 'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
}

/**
 * Maps a thrown login failure to one of the four FR7/FR8 outcome buckets.
 *
 * FR8 (neutral lockout, no countdown, no account-existence hint — "don't
 * let a locked vs not-found branch leak through UI structure even if the
 * copy string itself is shared"): `api/v1/auth/login.php`'s `cpal_login_verifier()`
 * (`auth.php` lines 534-607) already collapses the unknown-account,
 * soft-deleted, uninitialized-password, wrong-password, *and*
 * still-locked/newly-locked branches into a single `raison: 'identifiants'`
 * before the endpoint responds — every one of them reaches the API caller
 * as the exact same `401 invalid_credentials` body, word for word. GAP4
 * (`Auth-and-Session.md` — the legacy `login.php` page *did* leak a distinct
 * lockout message with a minutes countdown) is already closed at the
 * `/api/v1` layer: there is no status/code this client could key a separate
 * "lockout" branch on, so `genericRejection` below is both the rejection
 * bucket *and* the lockout bucket — one code path, not two, which is the
 * strongest form of "no branch leaks which applied". Documented here as the
 * open question this story resolves rather than guesses at: if a future
 * backend story ever adds a distinguishable lockout signal, it will need a
 * genuinely new branch (and a genuinely new, still-neutral, still
 * countdown-free copy) — this mapping is not meant to be stretched to
 * invent one today.
 */
export function mapAuthOutcome(error: unknown): AuthOutcome {
  if (!(error instanceof ApiError)) {
    // Transport-level failure (offline, DNS, CORS, an aborted request...) —
    // never surface the raw Error#message, which can contain arbitrary
    // fetch/browser detail.
    return 'serviceUnavailable'
  }

  if (error.status === 401 && error.code === 'unauthorized') {
    return 'sessionExpired'
  }
  if (error.status === 401) {
    // Covers `invalid_credentials` (and any other 401 this endpoint might
    // someday send) — wrong password, unknown account, soft-deleted,
    // uninitialized-password, and locked, all identically.
    return 'genericRejection'
  }
  if (error.status === 429) {
    return 'ipThrottle'
  }
  if (error.status >= 500) {
    return 'serviceUnavailable'
  }
  // 400 invalid_body, 405 method_not_allowed, or anything else unexpected —
  // FR5 already blocks an empty-field submit client-side, so 400 shouldn't
  // be reachable in practice; fall back to the generic rejection copy
  // rather than ever rendering a raw backend string.
  return 'genericRejection'
}

/** Convenience wrapper returning the mapped outcome's user-facing copy directly. */
export function getAuthOutcomeMessage(error: unknown): string {
  return AUTH_OUTCOME_MESSAGES[mapAuthOutcome(error)]
}
