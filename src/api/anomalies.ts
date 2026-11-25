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
  /** value − threshold, signed, computed server-side; null for a geofence or a missing value. */
  excess: number | null
  unit: string
  eventDate: string
  detectedAt: string
  chipId: string
  lot: AnomalyLot | null
}

/** A status change, or a comment saved without one (`from` = `to`, see `isCommentEntry`). */
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
  /** The last status change (comment-only entries excluded). */
  lastChange: { at: string; by: AnomalyHistoryEntry['by'] } | null
  history: AnomalyHistoryEntry[]
  /** Computed by the server only (KAN-263): what this user may do now, and why nothing when empty. */
  allowedTransitions: { to: AnomalyStatus; commentRequired: boolean }[]
  readOnlyReason: 'cloturee' | 'std_scope' | 'closing_right_required' | null
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

/** `POST /api/v1/anomalies/transition.php/{anomalyKey}` (KAN-263): answers 201 with the updated detail. */
export function postAnomalyTransition(
  contractId: number,
  anomalyKey: string,
  input: { from: AnomalyStatus; to: AnomalyStatus; comment: string },
): Promise<AnomalyDetail> {
  return apiClient.post<AnomalyDetail>(`/anomalies/transition.php/${encodeURIComponent(anomalyKey)}`, {
    contractId,
    ...input,
  })
}

/** True for a history entry that is a comment saved without a status change. */
export function isCommentEntry(entry: AnomalyHistoryEntry): boolean {
  return entry.from === entry.to
}

/** `POST /api/v1/anomalies/comment.php/{anomalyKey}?contractId=`: saves a comment, status unchanged; 201 = updated detail. */
export function postAnomalyComment(contractId: number, anomalyKey: string, comment: string): Promise<AnomalyDetail> {
  return apiClient.post<AnomalyDetail>(
    `/anomalies/comment.php/${encodeURIComponent(anomalyKey)}?contractId=${contractId}`,
    { comment },
  )
}
