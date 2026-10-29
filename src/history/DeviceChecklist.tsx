import { useLayoutEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { HistoryDevice } from '../api/history'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/ui/field'
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

  const innerRef = useRef<HTMLDivElement | null>(null)

  const virtualizer = useVirtualizer({
    count: devices.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    enabled: devices.length > VIRTUALIZE_THRESHOLD,
  })

  const virtualized = devices.length > VIRTUALIZE_THRESHOLD
  const totalSize = virtualizer.getTotalSize()

  // The windowed list's total height is data-driven (rows x row height); it is applied
  // imperatively so no inline `style` prop is needed (guideline: no inline style).
  useLayoutEffect(() => {
    if (innerRef.current) innerRef.current.style.height = `${totalSize}px`
  }, [totalSize, virtualized])

  if (devices.length === 0) {
    return (
      <p data-testid="device-checklist-empty" className="text-sm text-muted-foreground">
        Aucun appareil sur ce contrat.
      </p>
    )
  }

  function handleToggle(chipId: string) {
    onChange(toggleDeviceSelection(selected, allChipIds, chipId))
  }

  function renderRow(device: HistoryDevice) {
    const checked = isDeviceSelected(selected, device.ChipID)
    const id = `device-checklist-${device.ChipID}`
    return (
      <Field key={device.ChipID} orientation="horizontal" className="items-center py-1">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={() => handleToggle(device.ChipID)}
          data-testid={`device-checklist-item-${device.ChipID}`}
        />
        <FieldLabel htmlFor={id} className="font-mono text-sm font-normal text-foreground">
          {device.ChipID}
        </FieldLabel>
      </Field>
    )
  }

  return (
    <FieldSet className="gap-2 rounded-lg border border-border bg-card p-3 text-sm text-foreground" data-testid="device-checklist">
      <FieldLegend variant="label" className="px-1 text-xs text-muted-foreground">
        Appareils ({devices.length})
      </FieldLegend>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(selectAllDevices())}
          data-testid="device-checklist-select-all"
        >
          Tout sélectionner
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(selectNoDevices())}
          data-testid="device-checklist-select-none"
        >
          Tout désélectionner
        </Button>
      </div>

      {virtualized ? (
        <div ref={scrollRef} data-testid="device-checklist-scroll" className="h-60 overflow-auto">
          <div ref={innerRef} className="relative w-full">
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="absolute top-0 left-0 w-full"
                ref={(node) => {
                  if (node) {
                    node.style.height = `${virtualRow.size}px`
                    node.style.transform = `translateY(${virtualRow.start}px)`
                  }
                }}
              >
                {renderRow(devices[virtualRow.index])}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col">{devices.map((device) => renderRow(device))}</div>
      )}
    </FieldSet>
  )
}
