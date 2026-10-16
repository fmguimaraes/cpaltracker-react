import { apiClient } from './client'

/**
 * `GET /api/v1/devices/{deviceId}/config` (KAN-123, physically served from
 * `api/v1/devices/config.php?deviceId=...`). KAN-159 only ever calls the GET
 * side of this endpoint, and only to read `cpal_pilotage_resolve_device()`'s
 * verdict (see `src/pilotage/eligibility.ts`) — the config *values* this
 * returns are consumed by the settings form (KAN-163), not here.
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
