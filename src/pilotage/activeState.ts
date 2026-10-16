import { ApiError } from '../api/client'

/**
 * KAN-159 (FR4, NFR4) — "is this contract active today" has no
 * GET-readable flag anywhere in `/api/v1` either (GAP2/GAP3,
 * `cpal.docs/features/technical/Device-Pilotage.md`): the only signal that
 * exists is the 409 `contract_inactive` a *write* returns (`POST
 * /devices/{deviceId}/config`, `POST /devices/{deviceId}/transfer`) when
 * the device's owning contract isn't active today. KAN-159 itself has no
 * write control (the settings form is KAN-163, submission is KAN-166, the
 * transfer form is KAN-169) — this predicate is the shared primitive those
 * stories' submit handlers call so every one of them reports the API's
 * verdict the same way, rather than each re-deriving "active" independently
 * from contract dates (which NFR4 forbids outright).
 *
 * This story's own device-list/eligibility screen has nothing to feed this
 * with yet (no write happens here), so the inactive-contract banner
 * (CB4/CB5/CB11/CB20 in the technical doc) cannot be exercised until a
 * later story's submit path reports a 409 through it — tracked explicitly
 * as a known gap in this story's report, not silently dropped.
 */
export function isContractInactiveError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === 'contract_inactive'
}
