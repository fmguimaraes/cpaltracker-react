import { useEffect, useState } from 'react'
import type { HistoryResponse } from '../api/history'
import { FilterBar } from '@/ui/patterns/filter-bar'
import { WidgetCard } from '@/ui/widget-card'
import { DeviceChecklist } from './DeviceChecklist'
import { HistoryCharts } from './HistoryCharts'
import { LotHookHistory } from './LotHookHistory'
import { SamplingBanner } from './SamplingBanner'
import { SelectionSummaryPanel } from './SelectionSummaryPanel'
import { TimelineMap } from './TimelineMap'

/**
 * KAN-175 (FR4, FR9, FR19-24, NFR3) — everything that mounts once a
 * contract's history is confirmed accessible and loaded: the device
 * checklist driving `TimelineMap`'s `visibleDeviceIds` (KAN-174's
 * deliberate extension point), the three Plotly charts, the lot-hook
 * history, the sampling banner, and the selection summary.
 *
 * Owns exactly one piece of state — the current device selection
 * (`string[] | null`, `null` = all) — and resets it to "all" whenever a
 * NEW `history` response arrives (keyed on the `history` object identity,
 * same pattern `TimelineMap` already uses for its own `rows`-keyed resets):
 * a selection made against a previous contract/range shouldn't silently
 * carry over and hide devices the user never chose to hide in the new
 * result.
 *
 * Every panel here reads the same already-fetched `history.rows`/`.hooks`
 * and the same `selected` state — none of them ever calls `fetch` (FR9,
 * FR20: device-selection changes are 100% client-side, no refetch).
 */
export function HistoryReadyPanel({ history }: { history: HistoryResponse }) {
  const [selected, setSelected] = useState<string[] | null>(null)

  useEffect(() => {
    setSelected(null)
  }, [history])

  const hasRows = history.rows.length > 0

  // FR9: the device filter shown as a FilterBar chip; the checklist below stays the full control.
  const deviceFilters =
    selected === null
      ? []
      : [{ id: 'devices', attribute: 'Appareils', value: `${selected.length} sur ${history.devices.length}` }]

  function selectDeviceByChipId(value: string) {
    const wanted = value.trim().toLowerCase()
    const match = history.devices.find((device) => device.ChipID.toLowerCase() === wanted)
    if (match) setSelected([match.ChipID])
  }

  return (
    <div className="flex flex-col gap-4" data-testid="history-ready-panel">
      <SamplingBanner sampled={history.sampled} count={history.count} total={history.total} />

      {!hasRows && (
        <p data-testid="history-no-measurements" className="text-sm text-muted-foreground">
          Aucune mesure sur cette période.
        </p>
      )}

      <FilterBar
        attributes={['Appareil']}
        filters={deviceFilters}
        onRemove={() => setSelected(null)}
        onAdd={({ value }) => selectDeviceByChipId(value)}
      />

      <SelectionSummaryPanel rows={history.rows} visibleDeviceIds={selected} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <TimelineMap rows={history.rows} hooks={history.hooks} visibleDeviceIds={selected} />
        </div>
        <DeviceChecklist devices={history.devices} selected={selected} onChange={setSelected} />
      </div>

      <HistoryCharts rows={history.rows} visibleDeviceIds={selected} />

      <WidgetCard title="Historique d'accrochage de lot" data-testid="lot-hook-history-section">
        <LotHookHistory hooks={history.hooks} />
      </WidgetCard>
    </div>
  )
}
