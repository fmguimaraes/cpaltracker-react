import { addYears, format, isValid, parse, subYears } from 'date-fns'
import type { Position } from '../api/positions'
import { formatAbsolute } from '../anomalies/anomalyCard'
import { validateDateRangeInputs } from '../history/dateRange'
import { findLastIndexAtOrBefore, trailPositions, type DeviceSeries } from '../history/timelineData'
import type { MapTrail, MapViewport } from '@/ui/map'
import type { PeriodPreset } from '@/ui/patterns/period-control'
import { weightState } from '../live-tracking/markerStyle'

/**
 * Pulse timeline — pure helpers: the page's one period (a preset or typed du/au dates), the pallets'
 * positions at a playback instant (from the History API rows), and the map viewport test behind the
 * pallet chips. No React, no network.
 */

export const DAY_MS = 24 * 60 * 60_000

/**
 * The app's one preset set [1j | 7j | 15j | 1 mois] (days back from the latest load; owner 2026-11-25, kept
 * over the unified-shell spec's 24 h / 7 j / 30 j). `preset` is the shared `PeriodControl` value, `param`
 * the URL's `periode=`.
 */
export const PERIODS: { days: string; preset: PeriodPreset; param: string }[] = [
  { days: '1', preset: '24h', param: '1j' },
  { days: '7', preset: '7d', param: '7j' },
  { days: '15', preset: '15d', param: '15j' },
  { days: '30', preset: '30d', param: '1mois' },
]

/** Owner decision: Pulse opens on 1 mois (30 days). */
export const DEFAULT_PERIOD: RangeChoice = { kind: 'preset', days: '30' }

/** The shared control's preset of a choice (`null` = custom dates, or a preset outside the set). */
export function presetOfChoice(choice: RangeChoice): PeriodPreset | null {
  if (choice.kind !== 'preset') return null
  return PERIODS.find((p) => p.days === choice.days)?.preset ?? null
}

export function choiceOfPreset(preset: PeriodPreset): RangeChoice {
  return { kind: 'preset', days: PERIODS.find((p) => p.preset === preset)?.days ?? '30' }
}

/** `periode=` value: "1j" | "7j" | "15j" | "1mois", or "2026-11-01_2026-11-10" for custom local days. */
export function periodParam(choice: RangeChoice): string {
  if (choice.kind === 'custom') return `${choice.start}_${choice.end}`
  return PERIODS.find((p) => p.days === choice.days)?.param ?? PERIODS[PERIODS.length - 1].param
}

/** Links written before the owner's 1j · 7j · 15j · 1 mois set (same spans). */
const LEGACY_PARAMS: Record<string, string> = { '24h': '1j', '30j': '1mois' }

/** Reads `periode=`; `null` when absent or unreadable (the caller keeps its default). */
export function parsePeriodParam(value: string | null): RangeChoice | null {
  if (!value) return null
  const preset = PERIODS.find((p) => p.param === value || p.param === LEGACY_PARAMS[value])
  if (preset) return { kind: 'preset', days: preset.days }
  const match = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(value)
  if (!match || !parseDay(match[1]) || !parseDay(match[2])) return null
  return validateDateRangeInputs(match[1], match[2]).ok ? { kind: 'custom', start: match[1], end: match[2] } : null
}

/** A custom choice of the local days of `from`..`to` (the shared control's calendar). */
export function customChoice(from: Date, to: Date): RangeChoice {
  return { kind: 'custom', start: toDateInput(from), end: toDateInput(to) }
}

/** A preset (`days` back from the snapshot's "now") or the du/au dates typed in the timeline (`yyyy-MM-dd`, local days). */
export type RangeChoice = { kind: 'preset'; days: string } | { kind: 'custom'; start: string; end: string }

export interface TimeSpan {
  from: Date
  to: Date
}

const INPUT_FORMAT = 'yyyy-MM-dd'

function parseDay(value: string): Date | null {
  const day = parse(value, INPUT_FORMAT, new Date())
  return isValid(day) ? day : null
}

/** The range a choice stands for: a preset ends at `now`; typed dates cover whole local days. */
export function resolveRangeChoice(choice: RangeChoice, now: Date): TimeSpan {
  if (choice.kind === 'preset') return { from: new Date(now.getTime() - Number(choice.days) * DAY_MS), to: now }
  const start = parseDay(choice.start) ?? now
  const end = parseDay(choice.end) ?? now
  return {
    from: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
    to: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
  }
}

/** Latest instant a `Date` holds: the open end of a preset's report window. */
const END_OF_TIME = new Date(8.64e15)

/**
 * The window the map's last-report filter uses. A preset ("the last N days") has no upper bound: a report
 * stamped after the snapshot's load time (device or server clock ahead of the browser's, demo data) is still
 * the pallet's latest report, and bounding it at "now" made every such pallet vanish from the map. Typed
 * calendar days keep their end. The chart and replay span stay `range`.
 */
export function reportWindow(choice: RangeChoice, range: TimeSpan): TimeSpan {
  return choice.kind === 'preset' ? { from: range.from, to: END_OF_TIME } : range
}

/** A date input's value for an instant (local day). */
export function toDateInput(date: Date): string {
  return format(date, INPUT_FORMAT)
}

/**
 * Editing du (`start`) or au (`end`) turns the period into custom dates. The other bound follows when
 * the edit would invert the range or stretch it past the History API's one-year limit. `null` (an
 * empty or invalid value) keeps the current period.
 */
export function editRange(current: TimeSpan, field: 'start' | 'end', value: string): RangeChoice | null {
  const edited = parseDay(value)
  if (!edited) return null
  let start = field === 'start' ? edited : parseDay(toDateInput(current.from))!
  let end = field === 'end' ? edited : parseDay(toDateInput(current.to))!
  if (start > end) {
    if (field === 'start') end = start
    else start = end
  }
  if (field === 'start' && addYears(start, 1) < end) end = addYears(start, 1)
  if (field === 'end' && subYears(end, 1) > start) start = subYears(end, 1)
  const next = { kind: 'custom' as const, start: toDateInput(start), end: toDateInput(end) }
  return validateDateRangeInputs(next.start, next.end).ok ? next : null
}

/**
 * Playback: each pallet at its last geolocated History row at or before `instant` (that row's coordinates
 * and measures; the lot stays the snapshot's). A pallet with no position yet at that instant is left out.
 */
export function positionsAt(positions: Position[], byDevice: Map<string, DeviceSeries>, instant: number): Position[] {
  const out: Position[] = []
  for (const position of positions) {
    const series = byDevice.get(position.chipId)?.positions ?? []
    const idx = findLastIndexAtOrBefore(series, instant)
    if (idx < 0) continue
    const row = series[idx]
    out.push({
      ...position,
      timestamp: new Date(row.t).toISOString(),
      latitude: row.la,
      longitude: row.lo,
      ambientTemperature: row.ta,
      humidity: row.hr,
      mass: row.m,
      mpuTemperature: row.tm,
      accelG: row.g,
      // The weight state at that instant, against the snapshot's initial weight (Pulse snapshots only).
      ...(position.initialWeight === undefined ? {} : weightState(row.m, position.initialWeight)),
    })
  }
  return out
}

/**
 * Playback trails: for each pallet (in `positions`' order), its positioned History rows from the start of
 * the period (`from`, included) up to `instant`. Pallets with fewer than two such points get no trail.
 */
export function trailsAt(positions: Position[], byDevice: Map<string, DeviceSeries>, from: number, instant: number): MapTrail[] {
  const out: MapTrail[] = []
  for (const { chipId } of positions) {
    const series = byDevice.get(chipId)?.positions ?? []
    const end = findLastIndexAtOrBefore(series, instant)
    // First row at or after `from`: one past the last row strictly before it.
    const start = findLastIndexAtOrBefore(series, from - 1) + 1
    if (end - start < 1) continue
    out.push({ id: chipId, points: trailPositions(series.slice(start, end + 1), end - start) })
  }
  return out
}

/** Whether a position lies inside the map's current bounds (edges included). No bounds yet = everything. */
export function inViewport(position: Position, viewport: MapViewport | null): boolean {
  if (position.latitude === null || position.longitude === null) return false
  if (!viewport) return true
  const { latitude: lat, longitude: lng } = position
  return lat >= viewport.south && lat <= viewport.north && lng >= viewport.west && lng <= viewport.east
}

/** The replay instant's label, e.g. "15 nov. 11:00" (local time, fr-FR; the year when not the current one). */
export function formatInstant(ms: number, now: Date = new Date()): string {
  return formatAbsolute(new Date(ms), now)
}
