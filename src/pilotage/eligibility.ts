import { ApiError } from '../api/client'

/**
 * KAN-159 (FR3, NFR4) — MAIN-contract eligibility verdict.
 *
 * GAP1 (`cpal.docs/features/technical/Device-Pilotage.md`): there is no
 * stored, directly-readable "is this contract MAIN and eligible for
 * pilotage" flag anywhere in `/api/v1`. The one authoritative signal that
 * does exist is the 403 `forbidden` / "Device pilotage is limited to MAIN
 * contracts." response `cpal_pilotage_erreur_resolution()` returns from
 * `GET /devices/{deviceId}/config` when the device's owning contract isn't
 * `MAIN` (`pilotage_logic.php`). This function recognizes exactly that
 * signal and nothing else — it never inspects a contract's `contractType`
 * or dates itself (NFR4: "The UI SHALL NOT itself compute MAIN-vs-STD
 * eligibility").
 */
export type EligibilityVerdict =
  | { status: 'ineligible'; message: string }
  | { status: 'unknown' }

export function eligibilityFromError(error: unknown): EligibilityVerdict {
  if (error instanceof ApiError && error.status === 403 && error.code === 'forbidden') {
    return { status: 'ineligible', message: error.message }
  }
  return { status: 'unknown' }
}
