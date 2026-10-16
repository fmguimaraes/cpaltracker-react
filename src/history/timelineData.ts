import type { HistoryHook, HistoryRow } from '../api/history'

/**
 * KAN-174 (FR10-18, NFR1, NFR3) — pure, Leaflet-independent trail/replay
 * math replicating `cpaltracker.web/map_timeline.js` (CB19-CB25) exactly,
 * kept out of `TimelineMap.tsx` so none of it needs a DOM/map render to
 * unit-test (NFR3's "client-side, responsive" claim rests on this staying
 * synchronous and allocation-light per slider move).
 */

/** CB19 — fixed 10-entry palette, assigned in first-seen device order,
 * wrapping past 10 distinct devices. Identical hex values to the legacy
 * `PALETTE` constant (`map_timeline.js`), not re-picked. */
export const DEVICE_PALETTE = [
  '#1A237E',
  '#00838F',
  '#AD1457',
  '#4E342E',
  '#33691E',
  '#4527A0',
  '#00695C',
  '#BF360C',
  '#37474F',
  '#6A1B9A',
] as const

export interface DeviceSeries {
  chipId: string
  /** CB19/CB21 — this device's stable palette color (marker border). */
  color: string
  /** Only geolocated rows (`p === 1 && la !== null && lo !== null`),
   * sorted ascending by `t` (CB19). */
  positions: HistoryRow[]
}

/**
 * CB19 — groups rows per device, in first-seen (post-sort) order, and
 * keeps only the geolocated ones for map placement. Devices with
 * measurements but zero geolocated rows still get an (empty) entry, same
 * as the legacy `parDevice[r.c] = []` initialization — a device that only
 * reports sensor data with no position simply never produces a marker.
 */
export function buildDeviceSeries(rows: HistoryRow[]): Map<string, DeviceSeries> {
  const sorted = rows.slice().sort((a, b) => a.t - b.t)
  const byDevice = new Map<string, DeviceSeries>()
  let seen = 0
  for (const row of sorted) {
    let entry = byDevice.get(row.c)
    if (!entry) {
      entry = { chipId: row.c, color: DEVICE_PALETTE[seen % DEVICE_PALETTE.length], positions: [] }
      byDevice.set(row.c, entry)
      seen++
    }
    if (row.p === 1 && row.la !== null && row.lo !== null) {
      entry.positions.push(row)
    }
  }
  return byDevice
}

export interface SliderBounds {
  min: number
  max: number
  step: number
}

/** CB19 — slider `min`/`max` are the first/last row's `t` (across ALL
 * rows, not only geolocated ones — matches `rows[0].t`/`rows[rows.length
 * - 1].t` after the legacy global sort, CB13); `step` is
 * `max(1000, floor((max - min) / 2000))` ms. An empty data set collapses
 * to a disabled, zero-width slider pinned at "now" (legacy: `tMin = tMax =
 * Date.now()`). */
export function computeSliderBounds(rows: HistoryRow[]): SliderBounds {
  if (rows.length === 0) {
    const now = Date.now()
    return { min: now, max: now, step: 1000 }
  }
  const sorted = rows.slice().sort((a, b) => a.t - b.t)
  const min = sorted[0].t
  const max = sorted[sorted.length - 1].t
  return { min, max, step: Math.max(1000, Math.floor((max - min) / 2000)) }
}

/**
 * CB20 — binary search (`dernierAvant`) for the last index in a
 * `t`-ascending series at or before `instant`; `-1` means the device has
 * no position yet at that instant (FR12: not drawn, not an error).
 */
export function findLastIndexAtOrBefore(series: HistoryRow[], instant: number): number {
  let low = 0
  let high = series.length - 1
  let result = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (series[mid].t <= instant) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result
}

/** CB22 — the lot hook active for `chipId` at `instant`, half-open
 * interval `instant >= h.from && instant < h.to` (`lotA`). `null` when no
 * hook covers that instant — the tooltip then omits the lot fields
 * entirely (FR13). */
export function activeLotAt(hooks: HistoryHook[], chipId: string, instant: number): HistoryHook | null {
  for (const hook of hooks) {
    if (hook.c === chipId && instant >= hook.from && instant < hook.to) return hook
  }
  return null
}

/** CB21 — marker fill color from measured mass; `null`/`NaN` is grey,
 * matching `couleurMasse`'s thresholds exactly (`< 200` red, `< 500`
 * orange, else green). */
export function massFillColor(mass: number | null): string {
  if (mass === null || Number.isNaN(mass)) return '#9e9e9e'
  if (mass < 200) return '#c62828'
  if (mass < 500) return '#ef6c00'
  return '#2e7d32'
}

export interface VisibleMarker {
  chipId: string
  color: string
  row: HistoryRow
  /** Index of `row` within `series` — needed by the trail (CB23), which
   * draws from series-start up to (and including) this index, never the
   * full series. */
  idx: number
  series: HistoryRow[]
}

/**
 * FR12/CB20 — one marker per currently-visible device that has a position
 * at or before `instant`; a device with none yet is simply absent from the
 * result (not an error). `visibleIds === null` means "all devices"
 * (FR9/CB16's client-side-only filtering contract — this module never
 * calls the device list itself, it's handed an already-resolved
 * selection).
 */
export function computeVisibleMarkers(
  byDevice: Map<string, DeviceSeries>,
  visibleIds: string[] | null,
  instant: number,
): VisibleMarker[] {
  const markers: VisibleMarker[] = []
  for (const entry of byDevice.values()) {
    if (visibleIds !== null && !visibleIds.includes(entry.chipId)) continue
    if (entry.positions.length === 0) continue
    const idx = findLastIndexAtOrBefore(entry.positions, instant)
    if (idx < 0) continue
    markers.push({ chipId: entry.chipId, color: entry.color, row: entry.positions[idx], idx, series: entry.positions })
  }
  return markers
}

/** CB23 — trail points from series-start up to (and including) `idx`;
 * matches the legacy `idx > 0` guard (a single point has nothing to draw
 * a line through). */
export function trailPositions(series: HistoryRow[], idx: number): Array<[number, number]> {
  if (idx <= 0) return []
  return series.slice(0, idx + 1).map((row) => [row.la as number, row.lo as number])
}

/** CB25 ("Ajuster") — every visible device's entire positioned series,
 * not just its current-instant marker; used for the on-demand fit
 * control, distinct from the current-position-only auto-fit (FR15 vs
 * FR16). */
export function allPositionsForFit(
  byDevice: Map<string, DeviceSeries>,
  visibleIds: string[] | null,
): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (const entry of byDevice.values()) {
    if (visibleIds !== null && !visibleIds.includes(entry.chipId)) continue
    for (const row of entry.positions) points.push([row.la as number, row.lo as number])
  }
  return points
}

/** CB24 — replay advances simulated time by `max(1000, floor(span/200))`
 * ms per tick. */
export function replayStepMs(min: number, max: number): number {
  return Math.max(1000, Math.floor((max - min) / 200))
}

/** CB24 — fixed 80ms wall-clock tick interval for the replay animation. */
export const REPLAY_TICK_MS = 80

/** Shared UTC formatter for the slider's instant label and the tooltip's
 * measurement date/time field (CB22's `formatUTC`): `AAAA-MM-JJ
 * HH:MM:SS UTC`. */
export function formatUtcInstant(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())} UTC`
}
