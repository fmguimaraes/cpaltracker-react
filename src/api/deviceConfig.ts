import { ApiError, apiClient } from './client'

/**
 * `GET`/`POST /api/v1/devices/{deviceId}/config` (KAN-123, physically served
 * from `api/v1/devices/config.php`, same file dispatching on method — see
 * that file's header comment and `cpaltracker.web/api/openapi.yaml`'s
 * `/devices/config.php/{deviceId}` operation). KAN-159 only ever calls the
 * GET side, and only to read `cpal_pilotage_resolve_device()`'s verdict (see
 * `src/pilotage/eligibility.ts`) — the config *values* GET returns are
 * consumed by the settings form (KAN-163). KAN-166 adds the POST side: the
 * settings form's real submit (FR10/FR11).
 */
export interface DeviceConfig {
  deviceId: string
  contractId: number
  reglageId: number | null
  updatedAt: string | null
  config: Record<string, string | null>
}

export async function fetchDeviceConfig(deviceId: string): Promise<DeviceConfig> {
  return apiClient.get<DeviceConfig>(
    `/devices/config.php?deviceId=${encodeURIComponent(deviceId)}`,
  )
}

/**
 * KAN-166 (FR10/FR11) — `POST /api/v1/devices/{deviceId}/config`
 * (`api/v1/devices/config.php`'s POST branch). "Any subset of the uplink
 * configuration fields" per the OpenAPI contract; blank/omitted fields keep
 * their last value server-side (CB14) — `changes` here is exactly
 * `SettingsForm`'s already-filtered, already-validated change set, never the
 * raw form values.
 *
 * On success (202) the API returns `{ deviceId, contractId, modifiedFields }`
 * — no human-readable message, unlike the error responses below, so the
 * "accepted" flash text is authored client-side (mirroring `pilotage.php`'s
 * CB17 wording) rather than echoed from the API.
 *
 * On failure the API is the sole authority, surfaced as an `ApiError`
 * (`src/api/client.ts`):
 * - `409 contract_inactive` — the owning contract isn't active today
 *   (CB11/CB15/GAP2/GAP3). Detected via `isContractInactiveError()`
 *   (`src/pilotage/activeState.ts`, KAN-159's primitive, triggered for the
 *   first time by this story).
 * - `400 invalid_body` with the exact CB15 message — nothing in the
 *   submitted set actually differs from the device's current value
 *   (`cpal_pilotage_reglages_calculer()` throws before any row is inserted).
 *   Detected via `isNoChangeError()` below.
 * - Any other `400 invalid_body` — a field value `cpal_pilotage_valider_champ()`
 *   itself rejects (should be rare: `validateSettingsField()` mirrors the same
 *   rules client-side per FR9, but the API remains authoritative).
 */
export async function postDeviceConfig(
  deviceId: string,
  changes: Record<string, string>,
): Promise<{ deviceId: string; contractId: number; modifiedFields: string[] }> {
  return apiClient.post(
    `/devices/config.php?deviceId=${encodeURIComponent(deviceId)}`,
    changes,
  )
}

/**
 * CB15, verbatim: `cpal_pilotage_reglages_calculer()` throws exactly this
 * message (no interpolation, so it's a stable literal to match on) when
 * every submitted field carries forward unchanged vs. the device's current
 * row; `api/v1/devices/config.php` surfaces it as `400 invalid_body`. This
 * is the one case FR11 calls out by name ("no values changed") that isn't
 * otherwise distinguishable from a generic `400 invalid_body` (a rejected
 * field value) by status/code alone.
 */
const NO_CHANGE_MESSAGE = 'Aucune valeur modifiée : la ligne n\'a pas été créée.'

export function isNoChangeError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400 && error.message === NO_CHANGE_MESSAGE
}
