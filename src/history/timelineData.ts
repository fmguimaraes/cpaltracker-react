import type { HistoryHook, HistoryRow } from '../api/history'
import type { DeviceStatus } from '@/ui/status'

/**
 * KAN-174 (FR10-18, NFR1, NFR3) — pure, Leaflet-independent trail/replay
 * math replicating `cpaltracker.web/map_timeline.js` (CB19-CB25) exactly,
 * kept out of `TimelineMap.tsx` so none of it needs a DOM/map render to
 * unit-test (NFR3's "client-side, responsive" claim rests on this staying
 * synchronous and allocation-light per slider move).
 */

export interface DeviceSeries {
  chipId: string
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
  for (const row of sorted) {
    let entry = byDevice.get(row.c)
    if (!entry) {
      entry = { chipId: row.c, positions: [] }
      byDevice.set(row.c, entry)
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

/** CB21 — marker state from measured mass, same thresholds as `couleurMasse`
 * (`< 200` red, `< 500` orange, else green) mapped to the four D3 states
 * (F-22): alert, warning (yellow, never orange), ok; `null`/`NaN` is offline
 * (grey). The kit marker turns the state into token classes. */
export function massStatus(mass: number | null): DeviceStatus {
  if (mass === null || Number.isNaN(mass)) return 'offline'
  if (mass < 200) return 'alert'
  if (mass < 500) return 'warning'
  return 'ok'
}

/**
 * K-7 — the ONE stable device index shared by the map markers and every
 * chart: a device's position among the visible devices, in `byDevice`
 * (first-seen) order. Markers (`MapDevice.series`) and chart series
 * (`TimeSeriesChart` colours by array position) both read this, so a device
 * has the same colour/dash/symbol everywhere, even when it has no value for
 * a given chart field.
 */
export function visibleDeviceOrder(rows: HistoryRow[], visibleIds: string[] | null): string[] {
  const order: string[] = []
  for (const chipId of buildDeviceSeries(rows).keys()) {
    if (visibleIds !== null && !visibleIds.includes(chipId)) continue
    order.push(chipId)
  }
  return order
}

export interface VisibleMarker {
  chipId: string
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
    markers.push({ chipId: entry.chipId, row: entry.positions[idx], idx, series: entry.positions })
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

/** CB22's `formatUTC` (map_timeline.js): an instant as `AAAA-MM-JJ HH:MM:SS` in UTC, no suffix.
 * Also the history charts' x-axis values (dashboard.php formats its axis with the same UTC
 * helper), so the charts and the timeline never disagree with the browser's time zone. */
export function formatUtc(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}:${pad(d.getUTCSeconds())}`
}

/** Shared UTC formatter for the slider's instant label and the tooltip's
 * measurement date/time field (CB22's `formatUTC(...) + ' UTC'`): `AAAA-MM-JJ
 * HH:MM:SS UTC`. */
export function formatUtcInstant(ms: number): string {
  return `${formatUtc(ms)} UTC`
}
