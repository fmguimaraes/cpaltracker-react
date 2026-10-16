import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HistoryDevice } from '../api/history'
import { isDeviceSelected, selectAllDevices, selectNoDevices, toggleDeviceSelection } from './deviceSelection'

/**
 * KAN-175 (FR9, NFR3) — the device checklist: every contract device,
 * selected by default (`selected === null`), filtering `TimelineMap`, the
 * three charts and the selection summary entirely client-side (CB16,
 * CB17) — this component never calls `fetch`; it only calls `onChange`
 * with the next `string[] | null` selection, same contract `TimelineMap`
 * already accepts as `visibleDeviceIds` (KAN-174's deliberate extension
 * point).
 *
 * NFR3: beyond `VIRTUALIZE_THRESHOLD` devices, rows are windowed with
 * `@tanstack/react-virtual` (the stack-decision's approved "large lists"
 * package) so a contract with hundreds of devices stays responsive; below
 * the threshold every row renders directly (cheaper for the common case,
 * and avoids a fixed-height scroll area when it buys nothing).
 */
export interface DeviceChecklistProps {
  devices: HistoryDevice[]
  selected: string[] | null
  onChange: (next: string[] | null) => void
}

const VIRTUALIZE_THRESHOLD = 50
const ROW_HEIGHT_PX = 32

export function DeviceChecklist({ devices, selected, onChange }: DeviceChecklistProps) {
  const allChipIds = devices.map((device) => device.ChipID)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: devices.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    enabled: devices.length > VIRTUALIZE_THRESHOLD,
  })

  if (devices.length === 0) {
    return (
      <p data-testid="device-checklist-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucun appareil sur ce contrat.
      </p>
    )
  }

  function handleToggle(chipId: string) {
    onChange(toggleDeviceSelection(selected, allChipIds, chipId))
  }

  function renderRow(device: HistoryDevice) {
    const checked = isDeviceSelected(selected, device.ChipID)
    return (
      <label key={device.ChipID} className="flex items-center gap-2 py-1 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => handleToggle(device.ChipID)}
          data-testid={`device-checklist-item-${device.ChipID}`}
        />
        <span style={{ color: 'var(--color-text)' }}>{device.ChipID}</span>
      </label>
    )
  }

  const virtualized = devices.length > VIRTUALIZE_THRESHOLD

  return (
    <fieldset
      className="flex flex-col gap-2 rounded-md border p-3 text-sm"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      data-testid="device-checklist"
    >
      <legend className="px-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Appareils ({devices.length})
      </legend>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(selectAllDevices())}
          data-testid="device-checklist-select-all"
          className="rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Tout sélectionner
        </button>
        <button
          type="button"
          onClick={() => onChange(selectNoDevices())}
          data-testid="device-checklist-select-none"
          className="rounded-md border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Tout désélectionner
        </button>
      </div>

      {virtualized ? (
        <div ref={scrollRef} data-testid="device-checklist-scroll" style={{ height: 240, overflow: 'auto' }}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(devices[virtualRow.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        devices.map((device) => renderRow(device))
      )}
    </fieldset>
  )
}
