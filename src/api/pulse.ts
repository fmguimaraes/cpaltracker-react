import { apiClient } from './client'
import type { Position } from './positions'

/**
 * KAN-272 — `GET /api/v1/contracts/pulse.php/{contractId}`: Live Tracking's position shape plus the lot
 * hooked on each device (`lot`, null unless the caller owns it). `remainingWeight` equals `mass` (same
 * `V_PULSE` reading), so the existing mass thresholds colour the markers unchanged.
 */
interface PulseResponse {
  positions: Position[]
}

export async function fetchPulse(contractId: number): Promise<Position[]> {
  const body = await apiClient.get<PulseResponse>(`/contracts/pulse.php/${contractId}`)
  return body.positions ?? []
}
