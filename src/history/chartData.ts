import type { HistoryRow } from '../api/history'
import { buildDeviceSeries } from './timelineData'

/**
 * KAN-175 (FR19, FR20) — pure per-device trace-building for the three
 * Plotly charts (temperature, humidity, mass), replicating
 * `dashboard.php`'s CB26/CB27 exactly: one series per visible device, built
 * from `rows` (not just geolocated ones — unlike the map, a chart point
 * needs no position), nulls/NaN filtered out per-field, x is the raw
 * epoch-ms `t` (a plain number, never a date/time axis type — CB27), and
 * there is no fixed y-bound anywhere in this module (CB27's "no clipping"
 * is enforced by `HistoryCharts.tsx` never setting a `range`, not by
 * anything here). Kept Leaflet/Plotly-independent so it needs no chart
 * library to unit-test, same split as `timelineData.ts`.
 *
 * Device coloring reuses `buildDeviceSeries`'s palette assignment
 * (`timelineData.ts`, KAN-174) rather than re-deriving a first-seen order,
 * so a device's chart trace color always matches its map marker border
 * color (CB19/CB21) — one single source of truth for "which color is chip
 * X", not two.
 */
export type ChartField = 'ta' | 'hr' | 'm'

export interface ChartTrace {
  chipId: string
  color: string
  x: number[]
  y: number[]
}

/**
 * Builds one trace per device that is both visible (`visibleIds === null`
 * means "all") and has at least one non-null/non-NaN reading for `field`.
 * Points are sorted ascending by `t` within each device's trace (a numeric
 * x-axis doesn't require it, but keeps the plotted line from zig-zagging if
 * `rows` ever arrives out of order).
 */
export function buildChartTraces(
  rows: HistoryRow[],
  visibleIds: string[] | null,
  field: ChartField,
): ChartTrace[] {
  const byDevice = buildDeviceSeries(rows)
  const sortedRows = rows.slice().sort((a, b) => a.t - b.t)

  const traces: ChartTrace[] = []
  for (const [chipId, series] of byDevice) {
    if (visibleIds !== null && !visibleIds.includes(chipId)) continue

    const x: number[] = []
    const y: number[] = []
    for (const row of sortedRows) {
      if (row.c !== chipId) continue
      const value = row[field]
      if (value === null || Number.isNaN(value)) continue
      x.push(row.t)
      y.push(value)
    }
    if (x.length === 0) continue

    traces.push({ chipId, color: series.color, x, y })
  }
  return traces
}

export const CHART_FIELD_LABELS: Record<ChartField, string> = {
  ta: 'Température ambiante (°C)',
  hr: 'Humidité relative (%)',
  m: 'Masse (kg)',
}
