import { apiClient } from './client'

export type TrendsRisk = 'faible' | 'moyen' | 'eleve'

/** One lot of `GET /api/v1/contracts/trends.php/{contractId}` (KAN-256): stored values, nothing computed. */
export interface TrendsLot {
  cpalLot: string
  custLotNumber: string
  productName: string | null
  balanceKg: number
  referenceVelocity: number
  requiredVelocity: number
  z: number
  risk: TrendsRisk
  /** ISO date (YYYY-MM-DD). */
  expiryDate: string
}

export interface TrendsResponse {
  contract: { contractId: number; contractRef: string; contractType: string }
  lots: TrendsLot[]
}

export function fetchTrends(contractId: number): Promise<TrendsResponse> {
  return apiClient.get<TrendsResponse>(`/contracts/trends.php/${contractId}`)
}
