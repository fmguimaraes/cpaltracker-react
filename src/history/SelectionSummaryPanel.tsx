import type { HistoryRow } from '../api/history'
import { computeSelectionSummary } from './selectionSummary'

/**
 * KAN-175 (FR24) — "Sur la sélection" sidebar panel, recomputed on every
 * render from `rows`/`visibleDeviceIds` via the pure `computeSelectionSummary`
 * (CB28). No internal state, no network call — exactly the no-refetch
 * contract FR20 requires.
 */
export function SelectionSummaryPanel({
  rows,
  visibleDeviceIds = null,
}: {
  rows: HistoryRow[]
  visibleDeviceIds?: string[] | null
}) {
  const summary = computeSelectionSummary(rows, visibleDeviceIds)

  return (
    <div
      className="flex flex-col gap-1 rounded-md border p-3 text-sm"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      data-testid="selection-summary"
    >
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Sur la sélection
      </p>
      <p data-testid="selection-summary-count">{summary.measurementCount} mesure(s)</p>
      <p data-testid="selection-summary-device-count">{summary.deviceCount} appareil(s)</p>
      {summary.minAmbientTemp !== null && summary.maxAmbientTemp !== null ? (
        <p data-testid="selection-summary-temp-range">
          Température amb. : {summary.minAmbientTemp.toFixed(1)}°C – {summary.maxAmbientTemp.toFixed(1)}°C
        </p>
      ) : (
        <p data-testid="selection-summary-no-temp" style={{ color: 'var(--color-text-muted)' }}>
          Aucune température ambiante disponible sur la sélection.
        </p>
      )}
    </div>
  )
}
