import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { HistoryResponse } from '../api/history'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
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
 *
 * Operator decision 2026-11-13: the "Appareils" button opening the device
 * checklist in a Popover is the single device-filtering entry point (the
 * generic FilterBar's "Ajouter un filtre" form was redundant with it and
 * has been removed from this page). It is shown in the page header row,
 * right of the contract Select. `filterSlot` is that header element; the
 * button is portalled into it so it keeps sharing this component's
 * `selected` state. Without a slot (not yet attached, or a standalone
 * render) it stays inline at the top of the panel.
 */
export function HistoryReadyPanel({
  history,
  filterSlot = null,
}: {
  history: HistoryResponse
  filterSlot?: HTMLElement | null
}) {
  const [selected, setSelected] = useState<string[] | null>(null)
  const [deviceListOpen, setDeviceListOpen] = useState(false)
  // KAN-252 — `TimelineMap`'s playback/scrub instant, lifted here so the measure charts' modal
  // can draw an in-sync cursor; `null` while idle (see `TimelineMap`'s `onInstantChange` doc).
  const [cursorInstant, setCursorInstant] = useState<number | null>(null)

  useEffect(() => {
    setSelected(null)
  }, [history])

  const hasRows = history.rows.length > 0

  const deviceCount = selected === null ? history.devices.length : selected.length

  const deviceFilterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={deviceListOpen} onOpenChange={setDeviceListOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" data-testid="device-checklist-trigger">
            Appareils ({deviceCount}/{history.devices.length})
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[1100] w-80 p-4">
          <DeviceChecklist
            devices={history.devices}
            selected={selected}
            onChange={setSelected}
            hideTitle
            className="border-0 bg-transparent p-0"
          />
        </PopoverContent>
      </Popover>
      {selected !== null && (
        <Badge variant="outline" className="h-8 gap-1 pr-1 text-sm font-normal" data-testid="filter-chip">
          <span>
            Appareils = <span className="font-medium">{selected.length} sur {history.devices.length}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Retirer le filtre Appareils"
            onClick={() => setSelected(null)}
          >
            <X />
          </Button>
        </Badge>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4" data-testid="history-ready-panel">
      <SamplingBanner sampled={history.sampled} count={history.count} total={history.total} />

      {!hasRows && (
        <p data-testid="history-no-measurements" className="text-sm text-muted-foreground">
          Aucune mesure sur cette période.
        </p>
      )}

      {filterSlot ? createPortal(deviceFilterBar, filterSlot) : deviceFilterBar}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-10">
          <TimelineMap
            rows={history.rows}
            hooks={history.hooks}
            visibleDeviceIds={selected}
            onInstantChange={setCursorInstant}
          />
          <HistoryCharts
            rows={history.rows}
            visibleDeviceIds={selected}
            summaries={history.summaries}
            cursorInstant={cursorInstant}
          />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SelectionSummaryPanel rows={history.rows} visibleDeviceIds={selected} />
          <WidgetCard title="Historique d'accrochage de lot" data-testid="lot-hook-history-section">
            <LotHookHistory hooks={history.hooks} />
          </WidgetCard>
        </div>
      </div>
    </div>
  )
}
