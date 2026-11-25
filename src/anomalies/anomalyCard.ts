import type { AnomalyRow, AnomalyStatus } from '../api/anomalies'

/**
 * Pulse anomaly cards (owner redesign 2026-11-25): what each card line shows, built only from fields
 * the list endpoint really returns (`anomalies/list.php`). A missing field drops its segment, and
 * the segments are joined by the card, so no separator is ever left dangling.
 */

/** Non-breaking space between a number and its unit. */
const NBSP = '\u00a0'

export type RuleKind = 'temperature' | 'humidity' | 'shock' | 'mass' | 'geofence'

/** `high` = the rule fires at value >= threshold, `low` = at value <= threshold. */
export interface RuleDisplay {
  kind: RuleKind
  label: string
  unit: string
  direction: 'high' | 'low' | null
}

/**
 * The rule codes of `cpal_anomalies_unite` (backend). TH/HH/GH/LF come from the owner's table; their
 * "<=" twins (TL, HL) and the mass rules (PH, PL) are the same metrics, so they share the icon and label.
 */
export const RULE_DISPLAY: Record<string, RuleDisplay> = {
  TH: { kind: 'temperature', label: 'Température', unit: '°C', direction: 'high' },
  TL: { kind: 'temperature', label: 'Température', unit: '°C', direction: 'low' },
  HH: { kind: 'humidity', label: 'Humidité', unit: '%HR', direction: 'high' },
  HL: { kind: 'humidity', label: 'Humidité', unit: '%HR', direction: 'low' },
  GH: { kind: 'shock', label: 'Choc', unit: 'g', direction: 'high' },
  PH: { kind: 'mass', label: 'Masse', unit: 'kg', direction: 'high' },
  PL: { kind: 'mass', label: 'Masse', unit: 'kg', direction: 'low' },
  LF: { kind: 'geofence', label: 'Hors zone', unit: 'km', direction: null },
}

export function ruleDisplay(code: string): RuleDisplay | null {
  return RULE_DISPLAY[code] ?? null
}

/** Type filter key of a row: its rule kind, or `other` for a code outside `RULE_DISPLAY`. */
export type TypeKey = RuleKind | 'other'

export function typeKeyOf(code: string): TypeKey {
  return ruleDisplay(code)?.kind ?? 'other'
}

/** Type chips: display order and full label (tooltip / accessible name). */
export const TYPE_ORDER: TypeKey[] = ['temperature', 'humidity', 'shock', 'geofence', 'mass', 'other']

export const TYPE_LABEL: Record<TypeKey, string> = {
  temperature: 'Température',
  humidity: 'Humidité',
  shock: 'Choc',
  geofence: 'Hors zone',
  mass: 'Masse',
  other: 'Autres règles',
}

/** Max decimals per unit: 1 for °C, %HR and g (owner spec), 0 for kg (as the pallet charts). */
const UNIT_DECIMALS: Record<string, number> = { '°C': 1, '%HR': 1, g: 1, kg: 0 }

function decimalsFor(unit: string, value: number): number {
  if (unit === 'km') return Math.abs(value) >= 10 ? 0 : 1
  return UNIT_DECIMALS[unit] ?? 1
}

/**
 * "28", "6,2", "12 345", "−3": French digits, trailing zeros stripped, a true minus sign (U+2212, not
 * Intl's hyphen). `signed`: "+3" / "−3", and a plain "0" when the value rounds to zero (never "−0").
 */
export function formatNumber(value: number, maxDecimals: number, signed = false): string {
  const text = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: maxDecimals,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value)
  // 'auto' keeps the sign of a negative value that rounds to zero ("-0").
  return text === '-0' ? '0' : text.replace('-', '−')
}

/** "31 °C", "6,2 g", "5,6 km" (non-breaking space); the bare number when the unit is empty. */
export function formatMeasure(value: number, unit: string, signed = false): string {
  const text = formatNumber(value, decimalsFor(unit, value), signed)
  return unit === '' ? text : `${text}${NBSP}${unit}`
}

/** Kilometres in one degree of latitude (WGS84 mean), the same at every latitude. */
const KM_PER_DEGREE_LAT = 111.32

/**
 * Display-only conversion of a geofence's stored degree value to km. The backend stores
 * `max(|Δlat|, |Δlng|)` in degrees, so the axis (and with it the cos(latitude) shortening of a
 * longitude degree) is unknown, and the list returns no latitude: the latitude-degree factor, the same
 * at every latitude, is used, i.e. the upper bound of the true distance — hence the "≈".
 */
export function degreesToKm(degrees: number): number {
  return degrees * KM_PER_DEGREE_LAT
}

/** Statuses shown as closed ("Clôturée"): `fermee` (closed, may be reopened) and `cloturee` (final). */
export function isClosed(status: AnomalyStatus): boolean {
  return status === 'fermee' || status === 'cloturee'
}

/** Sort rank: new, then in progress, then closed. */
const STATUS_RANK: Record<AnomalyStatus, number> = { detectee: 0, en_cours: 1, fermee: 2, cloturee: 2 }

/** Parses the API's UTC wall-clock text ('YYYY-MM-DD HH:MM:SS[.mmm]'); null when unreadable. */
export function parseUtc(text: string | null | undefined): Date | null {
  if (!text) return null
  const date = new Date(`${text.trim().replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Default order: new > in progress > closed, then the most recent event first. */
export function sortAnomalies(rows: AnomalyRow[]): AnomalyRow[] {
  const time = (row: AnomalyRow) => parseUtc(row.eventDate)?.getTime() ?? 0
  return [...rows].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || time(b) - time(a))
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "il y a 2 h", "il y a 11 j", "il y a 3 mois" — browser time, French. */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime()
  if (elapsed < MINUTE) return 'à l’instant'
  const short = new Intl.RelativeTimeFormat('fr', { style: 'short', numeric: 'always' })
  if (elapsed < HOUR) return short.format(-Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return short.format(-Math.floor(elapsed / HOUR), 'hour')
  const days = Math.floor(elapsed / DAY)
  if (days < 30) return short.format(-days, 'day')
  const long = new Intl.RelativeTimeFormat('fr', { style: 'long', numeric: 'always' })
  if (days < 365) return long.format(-Math.floor(days / 30), 'month')
  return long.format(-Math.floor(days / 365), 'year')
}

/** "14 nov. 09:00" in the browser's time zone; the year is added when it isn't the current one. */
export function formatAbsolute(date: Date, now: Date = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear()
  const day = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)
  return `${day} ${time}`
}

/** Full local ISO 8601 timestamp with its offset, e.g. "2026-11-14T09:00:00+01:00". */
export function formatLocalIso(date: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  )
}

/** One card's content, every field optional; `null`/empty segments are simply absent. */
export interface AnomalyCardContent {
  rule: RuleDisplay | null
  /** Metric label (table) or, for an unknown code, the raw rule label from the data. */
  title: string
  /** Measured value with its unit (line 1), or the geofence distance ("≈ 72 km du centre"). */
  measure: string | null
  /** Signed excess ("+3 °C"). */
  excess: string | null
  /** Line 2 segments: the pallet/lot name or chip ID, then the threshold or radius. */
  details: string[]
  /** Line 3: relative + absolute local time, and the ISO tooltip. */
  time: { relative: string; absolute: string; iso: string } | null
  /** Icon tooltip: the rule code and the raw rule label (where any coordinates stay). */
  ruleTooltip: string
}

/**
 * The card's line-1 title, shared by the detail drawer's header so both read the same: "Température 31 °C",
 * or for a geofence "Hors zone · ≈ 72 km du centre".
 */
export function cardHeadline(card: Pick<AnomalyCardContent, 'rule' | 'title' | 'measure'>): string {
  return [card.title, card.measure].filter(Boolean).join(card.rule?.kind === 'geofence' ? ' · ' : ' ')
}

/** Coordinates as French text, 4 decimals (~10 m): "48,8534, 2,3488". */
export function formatCoordinates(point: { lat: number; lng: number }): string {
  return `${formatNumber(point.lat, 4)}, ${formatNumber(point.lng, 4)}`
}

/**
 * Builds a card from a list row. `showName` false (pallet panel, whose header already names the chip)
 * keeps only a lot name, never the chip ID.
 */
export function anomalyCardContent(row: AnomalyRow, options: { showName?: boolean; now?: Date } = {}): AnomalyCardContent {
  const { showName = true, now = new Date() } = options
  const rule = ruleDisplay(row.code)
  const lotName = row.lot?.custLotNumber?.trim() || null
  const name = lotName ?? (showName && row.chipId ? row.chipId : null)
  const ruleTooltip = [row.code, row.label].filter(Boolean).join(' · ')

  const title = rule?.label ?? (row.label || row.code)
  let measure: string | null = null
  let excess: string | null = null
  const details: (string | null)[] = [name]

  if (rule?.kind === 'geofence') {
    // Stored in degrees; a zone/site name is never part of the data, so the distance is "du centre".
    if (row.value !== null) measure = `≈${NBSP}${formatMeasure(degreesToKm(row.value), 'km')} du centre`
    if (row.threshold !== null) details.push(`rayon ${formatMeasure(degreesToKm(row.threshold), 'km')}`)
  } else {
    const unit = rule?.unit ?? row.unit
    if (row.value !== null) measure = formatMeasure(row.value, unit)
    if (row.excess !== null) excess = formatMeasure(row.excess, unit, true)
    if (row.threshold !== null) details.push(`seuil ${formatMeasure(row.threshold, unit)}`)
  }

  const date = parseUtc(row.eventDate)
  return {
    rule,
    title,
    measure,
    excess,
    details: details.filter((segment): segment is string => Boolean(segment)),
    time: date ? { relative: formatRelative(date, now), absolute: formatAbsolute(date, now), iso: formatLocalIso(date) } : null,
    ruleTooltip,
  }
}
