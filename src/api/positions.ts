import { apiClient } from './client'

/**
 * `GET /api/v1/devices/positions.php?contractId=...` (KAN-121). Every
 * nullable field here really can be null — the backend only guarantees a
 * row exists per device with `HasPosition=1`, not that every reading on
 * it is populated (`tracking_logic.php`'s `cpal_tracking_position_vers_api`
 * uses `isset()` per field, not a single all-or-nothing check).
 */
export interface Position {
  contractId: number
  chipId: string
  timestamp: string | null
  latitude: number | null
  longitude: number | null
  ambientTemperature: number | null
  humidity: number | null
  mass: number | null
  mpuTemperature: number | null
  accelG: number | null
}

interface PositionsResponse {
  positions: Position[]
}

export async function fetchPositions(contractId: number): Promise<Position[]> {
  const body = await apiClient.get<PositionsResponse>(
    `/devices/positions.php?contractId=${contractId}`,
  )
  return body.positions ?? []
}
