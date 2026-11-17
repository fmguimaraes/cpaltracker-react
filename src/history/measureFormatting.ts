import type { MeasureExcursions, MeasureKey } from '../api/history'

/**
 * KAN-252 (FR11, FR15) — every number shown on a tile or in the expand
 * modal is already computed by the backend (KAN-231); this module owns
 * ONLY formatting (locale, sign, decimals, labels), never a statistic, so
 * it stays a pure, DOM/chart-library-free module to unit-test, same split
 * as `chartData.ts`/`timelineData.ts`.
 */

export type { MeasureKey }

/** Short labels (no unit) for the tile header (FR11.1) — unit is shown separately. */
export const MEASURE_LABELS: Record<MeasureKey, string> = {
  ta: 'Température ambiante',
  hr: 'Humidité relative',
  m: 'Masse',
}

export const MEASURE_UNITS: Record<MeasureKey, string> = { ta: '°C', hr: '%', m: 'kg' }

/** FR9 — safe temperature band drawn on the temperature chart. TODO(KAN-34): read from `T_REGLAGES`. */
export const TEMPERATURE_THRESHOLD = { min: 2, max: 8 }

/** FR15 — `fr-FR`-formatted number at `decimals` precision; `null` renders as an em dash. */
export function formatMeasureValue(value: number | null, decimals: number): string {
  if (value === null || Number.isNaN(value)) return '—'
  return value.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Same as `formatMeasureValue`, with an explicit `+`/`−` sign (U+2212, not a hyphen). */
export function formatSignedMeasureValue(value: number | null, decimals: number): string {
  if (value === null || Number.isNaN(value)) return '—'
  const sign = value < 0 ? '−' : '+'
  return `${sign}${formatMeasureValue(Math.abs(value), decimals)}`
}

/** `"5,2 °C"`, or `"—"` when `value` is `null` — the one unit-appending wrapper every stat
 * display (tile footer, modal stats row) builds on, so there's a single place that does it. */
export function formatStatValue(value: number | null, decimals: number, unit: string): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${formatMeasureValue(value, decimals)} ${unit}`
}

/** Same as `formatStatValue`, with an explicit `+`/`−` sign (U+2212). */
export function formatSignedStatValue(value: number | null, decimals: number, unit: string): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${formatSignedMeasureValue(value, decimals)} ${unit}`
}

/** FR11.3 — `"Δ 24 h −3.2 °C"`, or `"Δ 24 h —"` when `change24h` is `null`. */
export function formatChange24hLabel(change24h: number | null, decimals: number, unit: string): string {
  if (change24h === null || Number.isNaN(change24h)) return 'Δ 24 h —'
  return `Δ 24 h ${formatSignedStatValue(change24h, decimals, unit)}`
}

/** `"min 2,0 · max 8,4 °C"` — FR11.5's footer, before any excursions badge. */
export function formatMinMaxFooter(min: number | null, max: number | null, decimals: number, unit: string): string {
  return `min ${formatMeasureValue(min, decimals)} · max ${formatMeasureValue(max, decimals)} ${unit}`
}

/** FR11.5 — `"<count>/<total> hors <low>–<high> <unit>"`; callers only render it when `count > 0`. */
export function formatExcursionsBadge(excursions: MeasureExcursions, decimals: number, unit: string): string {
  const low = formatMeasureValue(excursions.low, decimals)
  const high = formatMeasureValue(excursions.high, decimals)
  return `${excursions.count}/${excursions.total} hors ${low}–${high} ${unit}`
}

/** `fr-FR` grouped integer, for the modal's "Mesures" stat. */
export function formatMeasureCount(count: number): string {
  return count.toLocaleString('fr-FR')
}

export type TrendDirection = 'up' | 'down' | 'flat'

/** Maps the backend's `trend` field to an arrow direction (FR11.3's "trend arrow"). */
export function trendDirection(trend: 'rising' | 'falling' | 'stable' | null): TrendDirection {
  if (trend === 'rising') return 'up'
  if (trend === 'falling') return 'down'
  return 'flat'
}

export interface SparklinePaths {
  /** `<path d>` for the line. */
  line: string
  /** `<path d>` for the light area fill under the line, closed to the baseline. */
  area: string
}

/**
 * FR11.4 — builds the sparkline's SVG paths from the backend's `[iso, avg]`
 * points, scaled to the data's own min/max (never a fixed/shared scale).
 * Pure geometry, no chart library, so it needs no DOM to unit-test.
 */
export function buildSparklinePaths(
  points: readonly (readonly [string, number])[],
  width: number,
  height: number,
): SparklinePaths | null {
  const values = points.map(([, v]) => v)
  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min

  const coords = values.map((value, i) => {
    const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width
    const y = span === 0 ? height / 2 : height - ((value - min) / span) * height
    return [x, y] as const
  })

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const firstX = coords[0][0].toFixed(2)
  const lastX = coords[coords.length - 1][0].toFixed(2)
  const baseline = height.toFixed(2)
  const area = `${line} L${lastX},${baseline} L${firstX},${baseline} Z`

  return { line, area }
}
