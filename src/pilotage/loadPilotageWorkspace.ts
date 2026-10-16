import { ApiError } from '../api/client'
import { fetchDeviceConfig } from '../api/deviceConfig'
import { fetchPositions, type Position } from '../api/positions'
import { eligibilityFromError } from './eligibility'

/**
 * KAN-159 (FR2, FR3, FR5, NFR2, NFR4) — loads everything the pilotage
 * device-list screen needs for one contract, kept as a pure
 * (adapter-boundary-only) async function so the state machine is testable
 * without mounting a component (code-standards.md "No business logic in UI
 * components").
 *
 * Device source (FR5): there is no dedicated "pilotage device list for a
 * contract" endpoint in `/api/v1` yet (the KAN-123 endpoints are
 * device-first: `GET/POST /devices/{deviceId}/config|transfer`, not
 * contract-first) — this reuses `GET /devices/positions.php?contractId=`
 * (KAN-121/158), the one existing endpoint that returns a contract's live
 * device identities, scoped and authorized via `cpal_contrat_autorise()`.
 * Documented as a known gap in this story's report rather than worked
 * around with a client-side query the backend doesn't expose.
 *
 * Eligibility (FR3/NFR4): the server-side MAIN-only check only runs on
 * `GET /devices/{deviceId}/config`, so this probes it with the contract's
 * first device once the device list is known (one call, not one per
 * device — `ContratType` is a property of the *contract*, identical for
 * every device on it). A contract with zero devices has nothing to probe
 * with and is reported as `empty` rather than guessed either way.
 */
export type PilotageWorkspaceResult =
  | { kind: 'unauthorized' }
  | { kind: 'ineligible'; message: string }
  | { kind: 'empty' }
  | { kind: 'eligible'; devices: Position[] }

export async function loadPilotageWorkspace(contractId: number): Promise<PilotageWorkspaceResult> {
  let devices: Position[]
  try {
    devices = await fetchPositions(contractId)
  } catch (error) {
    // Same uniform-404 convention as Live Tracking (KAN-168 FR15):
    // `cpal_contrat_autorise()` returns the same 404 whether the contract
    // doesn't exist or isn't this caller's — never distinguished client-side.
    if (error instanceof ApiError && error.status === 404) {
      return { kind: 'unauthorized' }
    }
    throw error
  }

  if (devices.length === 0) {
    return { kind: 'empty' }
  }

  try {
    await fetchDeviceConfig(devices[0].chipId)
  } catch (error) {
    const verdict = eligibilityFromError(error)
    if (verdict.status === 'ineligible') {
      return { kind: 'ineligible', message: verdict.message }
    }
    throw error
  }

  return { kind: 'eligible', devices }
}
