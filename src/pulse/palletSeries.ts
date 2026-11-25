import type { AnomalyRow } from '../api/anomalies'
import type { HistoryRow } from '../api/history'
import { formatNumber, parseUtc, ruleDisplay, type RuleKind } from '../anomalies/anomalyCard'

/**
 * Pulse pallet panel — pure series helpers (no DOM, no chart library). The History API has no
 * per-device filter yet (Pulse spec FR32 `chipIds`) and its `summaries` are contract-wide and lack
 * acceleration, so one pallet's series are read off the contract's `rows` here, filtered on the
 * pallet's ChipID and the range.
 */

export type PalletMeasureKey = 'm' | 'ta' | 'hr' | 'g'

export interface PalletMeasure {
  key: PalletMeasureKey
  label: string
  /** The anomaly cards' unit for this metric (`RULE_DISPLAY`), so a chart and a card read the same. */
  unit: string
  /** The anomaly rule kind drawn on this chart (its thresholds and dots). */
  kind: RuleKind
  /** `stems`: discrete events (a shock is instantaneous), never a continuous line. */
  style: 'line' | 'stems'
  /** Smallest y span, centred on the data, so a flat signal looks flat instead of filling the chart. */
  minSpan: (values: readonly number[]) => number
  /** A quantity that cannot go below 0: the padded domain is shifted up rather than showing "-1". */
  nonNegative: boolean
}

/**
 * The charts of the panel, in display order. No threshold is hard-coded here: the lines drawn are the
 * thresholds of this pallet's own anomalies (`ruleThresholds`), the only rule values the API exposes.
 */
export const PALLET_MEASURES: PalletMeasure[] = [
  { key: 'ta', label: 'Température', unit: '°C', kind: 'temperature', style: 'line', minSpan: () => 10, nonNegative: false },
  { key: 'hr', label: 'Humidité', unit: '%HR', kind: 'humidity', style: 'line', minSpan: () => 20, nonNegative: true },
  { key: 'g', label: 'Accélération', unit: 'g', kind: 'shock', style: 'stems', minSpan: () => 2, nonNegative: true },
  {
    key: 'm',
    label: 'Poids',
    unit: 'kg',
    kind: 'mass',
    style: 'line',
    minSpan: (values) => Math.max(0.05 * Math.max(...values.map(Math.abs)), 100),
    nonNegative: true,
  },
]

export interface PalletSeries {
  /** Epoch-ms, ascending. */
  t: number[]
  values: number[]
  last: number | null
}

/** One measure of one device over `[from, to]`: readings without a value are skipped. */
export function palletSeries(
  rows: readonly HistoryRow[],
  chipId: string,
  key: PalletMeasureKey,
  range: { from: Date; to: Date },
): PalletSeries {
  const from = range.from.getTime()
  const to = range.to.getTime()
  const points = rows
    .filter((row) => row.c === chipId && row.t >= from && row.t <= to && row[key] !== null)
    .map((row) => [row.t, row[key] as number] as const)
    .sort((a, b) => a[0] - b[0])
  const values = points.map(([, value]) => value)
  return {
    t: points.map(([t]) => t),
    values,
    last: values.length > 0 ? values[values.length - 1] : null,
  }
}

/** Median of the intervals between consecutive instants (ascending); null under two instants. */
export function medianInterval(times: readonly number[]): number | null {
  const steps: number[] = []
  for (let i = 1; i < times.length; i++) {
    const step = times[i] - times[i - 1]
    if (step > 0) steps.push(step)
  }
  if (steps.length === 0) return null
  steps.sort((a, b) => a - b)
  const middle = Math.floor(steps.length / 2)
  return steps.length % 2 === 1 ? steps[middle] : (steps[middle - 1] + steps[middle]) / 2
}

/**
 * The reporting interval a pallet is expected to keep: 2× the median interval between its readings
 * (any measure) — the backend has no reporting-interval setting readable here. Null when too few readings.
 */
export function expectedInterval(rows: readonly HistoryRow[], chipId: string): number | null {
  const times = [...new Set(rows.filter((row) => row.c === chipId).map((row) => row.t))].sort((a, b) => a - b)
  const median = medianInterval(times)
  return median === null ? null : 2 * median
}

/** True when the last reading is older than the expected interval; never true without one. */
export function isStale(last: Date, now: Date, expected: number | null): boolean {
  return expected !== null && now.getTime() - last.getTime() > expected
}

export interface GappedSeries {
  /** Epoch-ms, with `null` between two readings separated by a gap (the line breaks there). */
  t: (number | null)[]
  values: (number | null)[]
  /** `[from, to]` epoch-ms of each gap. */
  gaps: [number, number][]
}

/** Breaks the series where two readings are more than 2× the median interval apart: never interpolated. */
export function breakAtGaps(series: Pick<PalletSeries, 't' | 'values'>): GappedSeries {
  const median = medianInterval(series.t)
  const limit = median === null ? Infinity : 2 * median
  const out: GappedSeries = { t: [], values: [], gaps: [] }
  series.t.forEach((t, i) => {
    if (i > 0 && t - series.t[i - 1] > limit) {
      out.t.push(null)
      out.values.push(null)
      out.gaps.push([series.t[i - 1], t])
    }
    out.t.push(t)
    out.values.push(series.values[i])
  })
  return out
}

/** The thresholds of this pallet's anomalies for one rule kind, distinct and ascending. */
export function ruleThresholds(anomalies: readonly AnomalyRow[], kind: RuleKind): number[] {
  const values = anomalies
    .filter((row) => ruleDisplay(row.code)?.kind === kind && row.threshold !== null)
    .map((row) => row.threshold as number)
  return [...new Set(values)].sort((a, b) => a - b)
}

/** Anomalies whose event falls inside `[from, to]`. */
export function anomaliesInRange(anomalies: readonly AnomalyRow[], range: { from: Date; to: Date }): AnomalyRow[] {
  const from = range.from.getTime()
  const to = range.to.getTime()
  return anomalies.filter((row) => {
    const at = parseUtc(row.eventDate)?.getTime()
    return at !== undefined && at >= from && at <= to
  })
}

/**
 * The y domain of one chart: the data, widened to the metric's minimum span around its centre, then to
 * every threshold and anomaly reading (`extras`), padded by ~8%, then rounded outward to a "nice" step
 * (1/2/5 × 10^n, `niceStep`), so its two labels are round numbers: 40–70 %HR, 8 700–9 300 kg.
 */
export function yDomain(
  measure: Pick<PalletMeasure, 'minSpan' | 'nonNegative'>,
  values: readonly number[],
  extras: readonly number[] = [],
): [number, number] {
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const minSpan = measure.minSpan(values)
  if (hi - lo < minSpan) {
    const centre = (lo + hi) / 2
    lo = centre - minSpan / 2
    hi = centre + minSpan / 2
  }
  lo = Math.min(lo, ...extras)
  hi = Math.max(hi, ...extras)
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  if (measure.nonNegative && lo < 0 && Math.min(...values, ...extras) >= 0) {
    hi -= lo
    lo = 0
  }
  const step = niceStep((hi - lo) / 5)
  // Rounded first, so a float residue (28.000000000004) does not push the end one step out.
  const outward = (value: number, round: (n: number) => number) => Number((round(Number((value / step).toFixed(6))) * step).toFixed(1))
  return [outward(lo, Math.floor), outward(hi, Math.ceil)]
}

/** The 1/2/5 × 10^n step closest (on a log scale) to `rough`; never under 0.1 (the labels' max precision). */
export function niceStep(rough: number): number {
  if (!(rough > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const candidates = [1, 2, 5, 10].map((factor) => factor * magnitude)
  const closest = candidates.reduce((best, step) =>
    Math.abs(Math.log(step / rough)) < Math.abs(Math.log(best / rough)) ? step : best,
  )
  return Math.max(Number(closest.toPrecision(1)), 0.1)
}

/** The two y labels, top (max) then bottom (min): fr-FR ("9 300"), no unit; 1 decimal only if an end needs it. */
export function yLabels(domain: readonly [number, number]): [string, string] {
  const decimals = Number.isInteger(domain[0]) && Number.isInteger(domain[1]) ? 0 : 1
  return [formatNumber(domain[1], decimals), formatNumber(domain[0], decimals)]
}

/** Plotly date text in the browser's time zone ('YYYY-MM-DD HH:MM:SS'), so the axis shows local times. */
export function localPlotTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

const HOUR = 3_600_000

/** "14 nov.", or "14 nov. 08:00" with `withHour` — French, local time (Plotly's month names are English). */
export function formatEdgeDate(ms: number, withHour: boolean): string {
  const date = new Date(ms)
  const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(date)
  if (!withHour) return day
  return `${day} ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date)}`
}

/** First → last instant with data in the period: the readings of every measure, and the anomaly dots. */
export interface DataExtent {
  first: number
  last: number
}

export function dataExtent(times: readonly number[]): DataExtent | null {
  if (times.length === 0) return null
  return { first: Math.min(...times), last: Math.max(...times) }
}

/** The extent's two dates; the hour is added when it spans under 48 h. */
export function extentLabels(extent: DataExtent): [string, string] {
  const withHour = extent.last - extent.first < 48 * HOUR
  return [formatEdgeDate(extent.first, withHour), formatEdgeDate(extent.last, withHour)]
}

/** "Données du 14 nov. au 15 nov." when the data covers less than half of the selected period, else null. */
export function coverageNote(extent: DataExtent | null, range: { from: Date; to: Date }): string | null {
  if (extent === null) return null
  const period = range.to.getTime() - range.from.getTime()
  if (period <= 0 || (extent.last - extent.first) / period >= 0.5) return null
  const [first, last] = extentLabels(extent)
  return `Données du ${first} au ${last}`
}
