import { useEffect, useState } from 'react'
import type { HistoryResponse } from '../api/history'
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

  return (
    <div className="flex flex-col gap-4" data-testid="history-ready-panel">
      <SamplingBanner sampled={history.sampled} count={history.count} total={history.total} />

      {!hasRows && (
        <p data-testid="history-no-measurements" style={{ color: 'var(--color-text-muted)' }}>
          Aucune mesure sur cette période.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
        <TimelineMap rows={history.rows} hooks={history.hooks} visibleDeviceIds={selected} />
        <div className="flex flex-col gap-4">
          <DeviceChecklist devices={history.devices} selected={selected} onChange={setSelected} />
          <SelectionSummaryPanel rows={history.rows} visibleDeviceIds={selected} />
        </div>
      </div>

      <HistoryCharts rows={history.rows} visibleDeviceIds={selected} />

      <section data-testid="lot-hook-history-section" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
          Historique d'accrochage de lot
        </h2>
        <LotHookHistory hooks={history.hooks} />
      </section>
    </div>
  )
}
