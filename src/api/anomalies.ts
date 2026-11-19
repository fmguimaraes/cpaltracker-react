import { apiClient } from './client'

/**
 * `GET /api/v1/anomalies/list.php/{contractId}` and `detail.php/{anomalyKey}?contractId=` (KAN-261).
 * Dates are UTC wall-clock text (`AAAA-MM-JJ HH:MM:SS`), shown as stored.
 */
export type AnomalyStatus = 'detectee' | 'en_cours' | 'fermee' | 'cloturee'

export interface AnomalyLot {
  cpalLot: string | null
  custLotNumber: string | null
  productName: string | null
}

export interface AnomalyRow {
  anomalyKey: string
  status: AnomalyStatus
  code: string
  label: string
  threshold: number | null
  value: number | null
  unit: string
  eventDate: string
  detectedAt: string
  chipId: string
  lot: AnomalyLot | null
}

export interface AnomalyHistoryEntry {
  at: string
  from: AnomalyStatus
  to: AnomalyStatus
  /** `name` is null for an author of another organisation on a shared (STD) contract. */
  by: { name: string | null; sameOrganisation: boolean }
  comment: string | null
}

export interface AnomalyDetail extends Omit<AnomalyRow, 'status'> {
  contract: { contractId: number; contractType: string }
  rule: string
  readings: {
    temperature: number | null
    humidity: number | null
    mass: number | null
    acceleration: number | null
  }
  position: { lat: number; lng: number } | null
  referencePoint: { lat: number; lng: number } | null
  status: AnomalyStatus
  lastChange: { at: string; by: AnomalyHistoryEntry['by'] } | null
  history: AnomalyHistoryEntry[]
}

/** `statuses` omitted = the server default (everything but `cloturee`). */
export async function fetchAnomalies(contractId: number, statuses?: AnomalyStatus[]): Promise<AnomalyRow[]> {
  const query = statuses ? `?status=${statuses.join(',')}` : ''
  const body = await apiClient.get<{ anomalies: AnomalyRow[] }>(`/anomalies/list.php/${contractId}${query}`)
  return body.anomalies ?? []
}

export function fetchAnomalyDetail(contractId: number, anomalyKey: string): Promise<AnomalyDetail> {
  return apiClient.get<AnomalyDetail>(
    `/anomalies/detail.php/${encodeURIComponent(anomalyKey)}?contractId=${contractId}`,
  )
}
