import type { HistoryRow } from '../api/history'
import { visibleDeviceOrder } from './timelineData'

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
 * Device identity (K-7) is the shared `visibleDeviceOrder` index
 * (`timelineData.ts`): the map marker swatch and the position of the chart
 * series both come from it — one source of truth for "which colour is
 * chip X", not two. No colour lives in this module.
 */
export type ChartField = 'ta' | 'hr' | 'm'

export interface ChartTrace {
  chipId: string
  x: number[]
  y: number[]
}

/**
 * Builds one trace for EVERY visible device (`visibleIds === null` means
 * "all"), in the shared `visibleDeviceOrder` (K-7): a device with no
 * non-null/non-NaN reading for `field` keeps its slot as an empty trace, so
 * the position-based series styling of every later device never shifts and
 * stays identical to the map marker and to the other two charts. Points are
 * sorted ascending by `t` within each trace.
 */
export function buildChartTraces(
  rows: HistoryRow[],
  visibleIds: string[] | null,
  field: ChartField,
): ChartTrace[] {
  const sortedRows = rows.slice().sort((a, b) => a.t - b.t)

  return visibleDeviceOrder(rows, visibleIds).map((chipId) => {
    const x: number[] = []
    const y: number[] = []
    for (const row of sortedRows) {
      if (row.c !== chipId) continue
      const value = row[field]
      if (value === null || Number.isNaN(value)) continue
      x.push(row.t)
      y.push(value)
    }
    return { chipId, x, y }
  })
}

export const CHART_FIELD_LABELS: Record<ChartField, string> = {
  ta: 'Température ambiante (°C)',
  hr: 'Humidité relative (%)',
  m: 'Masse (kg)',
}
