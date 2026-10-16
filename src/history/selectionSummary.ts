import type { HistoryRow } from '../api/history'
import { isDeviceSelected } from './deviceSelection'

/**
 * KAN-175 (FR24) — "Sur la sélection" summary, replicating `dashboard.php`'s
 * CB28 exactly: measurement count, device count, and min/max ambient
 * temperature (°C, one decimal) over the CURRENTLY SELECTED devices' rows,
 * recomputed on every selection change from the already-fetched rows (no
 * refetch — same no-network contract as `timelineData.ts`). No humidity or
 * mass aggregate (CB28/v2.1 changelog: only temperature extrema remain).
 */
export interface SelectionSummary {
  measurementCount: number
  deviceCount: number
  /** `null` unless at least one selected row has a non-null `ta` (CB28). */
  minAmbientTemp: number | null
  maxAmbientTemp: number | null
}

export function computeSelectionSummary(
  rows: HistoryRow[],
  visibleDeviceIds: string[] | null,
): SelectionSummary {
  const selectedRows = rows.filter((row) => isDeviceSelected(visibleDeviceIds, row.c))

  const deviceIds = new Set(selectedRows.map((row) => row.c))

  let min: number | null = null
  let max: number | null = null
  for (const row of selectedRows) {
    if (row.ta === null || Number.isNaN(row.ta)) continue
    if (min === null || row.ta < min) min = row.ta
    if (max === null || row.ta > max) max = row.ta
  }

  return {
    measurementCount: selectedRows.length,
    deviceCount: deviceIds.size,
    minAmbientTemp: min === null ? null : Number(min.toFixed(1)),
    maxAmbientTemp: max === null ? null : Number(max.toFixed(1)),
  }
}
