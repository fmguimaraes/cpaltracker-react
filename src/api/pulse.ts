import { apiClient } from './client'
import { fetchAndStore, peekCache, type CacheKey } from './responseCache'
import type { Position } from './positions'

/**
 * KAN-272 — `GET /api/v1/contracts/pulse.php/{contractId}`: Live Tracking's position shape plus the lot
 * hooked on each device (`lot`, null unless the caller owns it). `remainingWeight` equals `mass` (same
 * `V_PULSE` reading), so the existing mass thresholds colour the markers unchanged.
 */
interface PulseResponse {
  positions: Position[]
}

const pulseKey = (contractId: number): CacheKey => ({ group: 'positions', fn: 'fetchPulse', contractId })

/** KAN-345: the last cached snapshot (younger than the maximum age), shown at once while it is revalidated. */
export function peekPulse(contractId: number): Position[] | undefined {
  return peekCache<Position[]>(pulseKey(contractId))
}

/** Always hits the network (Pulse's Refresh bypasses the cache) and caches its success (KAN-345). */
export function fetchPulse(contractId: number): Promise<Position[]> {
  return fetchAndStore(pulseKey(contractId), async () => {
    const body = await apiClient.get<PulseResponse>(`/contracts/pulse.php/${contractId}`)
    return body.positions ?? []
  })
}
