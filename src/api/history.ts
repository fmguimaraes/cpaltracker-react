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

/**
 * One row per device per `T_CONTRATS_DEVICES` entry (`history_logic.php`'s
 * `cpal_history_devices_du_contrat()`). `STATUT`/`MORT` are carried through
 * unparsed — KAN-175 (device checklist) owns interpreting them; this story
 * only needs `ChipID` to key the map's per-device series (CB19).
 */
export interface HistoryDevice {
  ChipID: string
  STATUT: string
  MORT: number | string
}

/**
 * One measurement row, key-flattened server-side exactly as CB12 documents
 * (`history_logic.php::cpal_history_mesures()` — same short keys as the
 * legacy `api_dashboard.php`, carried into `/api/v1` byte-for-byte so the
 * KAN-174 map/slider logic ported from `map_timeline.js` needs no
 * reshaping): `c` ChipID, `t` epoch-ms, `ts` raw EventDate, `p` HasPosition
 * (0/1), `la`/`lo` lat/long, `ta` ambient temp, `hr` humidity, `m` mass,
 * `g` acceleration, `tm` MPU temp. All measurement fields besides `c`/`t`/
 * `ts`/`p` are nullable — a row can be geolocated with no sensor reading,
 * or have a sensor reading with no position.
 */
export interface HistoryRow {
  c: string
  t: number
  ts: string
  p: 0 | 1
  la: number | null
  lo: number | null
  ta: number | null
  hr: number | null
  m: number | null
  g: number | null
  tm: number | null
}

/**
 * One lot-hook record (CB14), same short keys as the legacy endpoint
 * (`history_logic.php::cpal_history_hooks()`): `c` ChipID, `lot` cPAL lot
 * number, `cust` client lot number, `from`/`to` epoch-ms (half-open
 * interval — CB22's `t >= from && t < to`), `net`/`gros` weights, `nb`
 * quantity, `per` expiry date string.
 */
export interface HistoryHook {
  c: string
  lot: number | string
  cust: string | null
  from: number
  to: number
  net: number | null
  gros: number | null
  nb: number | null
  per: string | null
}

export interface HistoryResponse {
  contract: HistoryContract
  devices: HistoryDevice[]
  rows: HistoryRow[]
  hooks: HistoryHook[]
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
