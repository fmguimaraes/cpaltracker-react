import { apiClient } from './client'
import { formatIsoDate } from '../history/dateRange'

/**
 * `GET /api/v1/contracts/history.php/{contractId}` (KAN-122). `contract`
 * is the raw `cpal_contrat_autorise()` row (`cpaltracker.web/auth.php`) —
 * field names are the backend's own PascalCase, not re-cased here, since
 * this is the only place `DebutContrat`/`FinContrat` are ever exposed
 * (KAN-170 FR3's default-range computation reads them straight off this).
 */
export interface HistoryContract {
  ContratID: number
  ContratRef: string
  ContratType: string
  ClientID: number | null
  DebutContrat: string | null
  FinContrat: string | null
}

export interface HistoryResponse {
  contract: HistoryContract
  devices: unknown[]
  rows: unknown[]
  hooks: unknown[]
  count: number
  total: number
  sampled: boolean
}

export interface HistoryDateRange {
  start: Date | null
  end: Date | null
}

export async function fetchContractHistory(
  contractId: number,
  range: HistoryDateRange = { start: null, end: null },
): Promise<HistoryResponse> {
  const params = new URLSearchParams()
  if (range.start) params.set('start', formatIsoDate(range.start))
  if (range.end) params.set('end', formatIsoDate(range.end))
  const query = params.toString()
  const path = `/contracts/history.php/${contractId}${query ? `?${query}` : ''}`
  return apiClient.get<HistoryResponse>(path)
}

export function parseContractDate(raw: string | null): Date | null {
  if (raw === null) return null
  const [year, month, day] = raw.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}
