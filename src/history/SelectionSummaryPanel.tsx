import type { HistoryRow } from '../api/history'
import { Card, CardContent } from '@/ui/card'
import { Stat } from '@/ui/stat'
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

  const { minAmbientTemp, maxAmbientTemp } = summary

  return (
    <section aria-label="Sur la sélection" className="flex flex-col gap-2" data-testid="selection-summary">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
        <Card size="sm" className="sm:col-span-12">
          <CardContent>
            <div data-testid="selection-summary-count">
              <Stat label="Mesures" value={summary.measurementCount} unit=" mesure(s)" accent hideLabel />
            </div>
          </CardContent>
        </Card>
        <Card size="sm" className="sm:col-span-12">
          <CardContent>
            <div data-testid="selection-summary-device-count">
              <Stat label="Appareils" value={summary.deviceCount} unit=" appareil(s)" accent hideLabel />
            </div>
          </CardContent>
        </Card>
        <Card size="sm" className="sm:col-span-12">
          <CardContent>
            {minAmbientTemp !== null && maxAmbientTemp !== null ? (
              <div data-testid="selection-summary-temp-range">
                <Stat
                  label="Température amb."
                  value={`${minAmbientTemp.toFixed(1)}° – ${maxAmbientTemp.toFixed(1)}°`}
                  unit="Celsius"
                  accent
                  hideLabel
                />
              </div>
            ) : (
              <p data-testid="selection-summary-no-temp" className="text-sm text-muted-foreground">
                Aucune température ambiante disponible sur la sélection.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
