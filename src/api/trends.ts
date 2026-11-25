import { apiClient } from './client'

export type TrendsRisk = 'faible' | 'moyen' | 'eleve'

/** One lot of `GET /api/v1/contracts/trends.php/{contractId}` (KAN-256): stored z/risk plus server-derived values. */
export interface TrendsLot {
  cpalLot: string
  custLotNumber: string
  productName: string | null
  balanceKg: number
  referenceVelocity: number
  requiredVelocity: number
  /** requiredVelocity / referenceVelocity; null without a reference velocity. */
  velocityRatio: number | null
  z: number
  risk: TrendsRisk
  /** Plotted on the quadrant; false = insufficient history. */
  placed: boolean
  /** ISO date (YYYY-MM-DD). */
  expiryDate: string
  /** Calendar days from `asOf` to the expiry; negative once expired. */
  daysToExpiry: number
}

export interface TrendsSummary {
  /** Placed lots at risk élevé / moyen. */
  eleve: number
  moyen: number
  /** Days to the nearest expiry still ahead, or null. */
  nextExpiryDays: number | null
}

export interface TrendsResponse {
  contract: { contractId: number; contractRef: string; contractType: string }
  /** ISO date the derived values are computed for. */
  asOf: string
  summary: TrendsSummary
  lots: TrendsLot[]
}

export function fetchTrends(contractId: number): Promise<TrendsResponse> {
  return apiClient.get<TrendsResponse>(`/contracts/trends.php/${contractId}`)
}
