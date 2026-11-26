import { apiClient } from './client'
import { fetchAndStore, peekCache, type CacheKey } from './responseCache'

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
  /** KAN-272 — only on Pulse positions (`api/pulse.ts`); absent on Live Tracking's. */
  lot?: PositionLot | null
}

/** KAN-272 — the lot hooked on a device at its latest reading (`null` when none or not the caller's). */
export interface PositionLot {
  cpalLot: string
  custLotNumber: string | null
  productName: string | null
  expiryDate: string | null
  status: string | null
}

interface PositionsResponse {
  positions: Position[]
}

const positionsKey = (contractId: number): CacheKey => ({ group: 'positions', fn: 'fetchPositions', contractId })

/** KAN-345: the last cached answer (younger than the maximum age), shown at once while it is revalidated. */
export function peekPositions(contractId: number): Position[] | undefined {
  return peekCache<Position[]>(positionsKey(contractId))
}

/** Always hits the network (so a Refresh bypasses the cache) and caches its success (KAN-345). */
export function fetchPositions(contractId: number): Promise<Position[]> {
  return fetchAndStore(positionsKey(contractId), async () => {
    const body = await apiClient.get<PositionsResponse>(`/devices/positions.php?contractId=${contractId}`)
    return body.positions ?? []
  })
}
