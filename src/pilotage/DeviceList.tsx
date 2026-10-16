import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Position } from '../api/positions'

/**
 * KAN-159 (FR5, FR6) — renders the device list for an eligible, resolved
 * contract.
 *
 * FR6 (last-known calibration date): GAP7 (`cpal.docs/features/technical/
 * Device-Pilotage.md`) — `LASTCALIBRATION` is fetched by `pilotage.php` but
 * never exposed by any `/api/v1` endpoint today, so there is no calibration
 * field to show; per FR6's own decision ("shown only if the API exposes
 * it... the column is simply omitted"), this component omits it entirely
 * rather than fabricate one. The "last known reading" shown below is the
 * device's latest position *timestamp* (`GET /devices/positions.php`,
 * KAN-121) — explicitly labeled as that, never presented as a calibration
 * date.
 *
 * KAN-163 addition: `onSelect`/`selectedChipId` are optional so KAN-159's
 * own behavior and tests (plain, non-interactive rows) are unchanged when a
 * caller doesn't pass them. `PilotageWorkspace` passes both so the operator
 * can pick which device's settings form (KAN-163's `SettingsForm`) to show
 * (FR7).
 *
 * KAN-173 (NFR5) addition: "device and history lists SHALL remain
 * responsive for a contract's full device set (virtualize if large)" —
 * beyond `VIRTUALIZE_THRESHOLD` rows are windowed with
 * `@tanstack/react-virtual`, the same package and threshold
 * `DeviceChecklist.tsx` (KAN-175, NFR3) already established for the
 * analogous history device list, rather than a second ad hoc convention.
 * Below the threshold (every contract this story has actually seen) rows
 * render directly, so this story's own and every prior KAN-159/163 test
 * keeps asserting the exact same markup.
 */
export function DeviceList({
  devices,
  selectedChipId,
  onSelect,
}: {
  devices: Position[]
  selectedChipId?: string
  onSelect?: (chipId: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: devices.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    enabled: devices.length > VIRTUALIZE_THRESHOLD,
  })

  if (devices.length === 0) {
    return (
      <p data-testid="pilotage-devices-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucun device trouvé pour ce contrat.
      </p>
    )
  }

  function renderRow(device: Position) {
    const content = (
      <>
        <span style={{ color: 'var(--color-text)' }}>{device.chipId}</span>
        {device.timestamp && (
          <span
            data-testid={`pilotage-device-${device.chipId}-last-seen`}
            className="ml-2"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Dernière position connue : {device.timestamp}
          </span>
        )}
      </>
    )

    return (
      <li
        key={device.chipId}
        data-testid={`pilotage-device-${device.chipId}`}
        className="rounded-md border px-3 py-2 text-sm"
        style={{
          borderColor:
            onSelect && selectedChipId === device.chipId
              ? 'var(--color-primary)'
              : 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        {onSelect ? (
          <button
            type="button"
            data-testid={`pilotage-device-${device.chipId}-select`}
            aria-pressed={selectedChipId === device.chipId}
            onClick={() => onSelect(device.chipId)}
            className="w-full text-left"
          >
            {content}
          </button>
        ) : (
          content
        )}
      </li>
    )
  }

  if (devices.length > VIRTUALIZE_THRESHOLD) {
    return (
      <div
        ref={scrollRef}
        data-testid="pilotage-device-list-scroll"
        className="w-full"
        style={{ height: VIRTUALIZED_VIEWPORT_PX, overflow: 'auto' }}
      >
        <ul
          data-testid="pilotage-device-list"
          className="w-full"
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
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
        </ul>
      </div>
    )
  }

  return (
    <ul data-testid="pilotage-device-list" className="flex flex-col gap-2">
      {devices.map((device) => renderRow(device))}
    </ul>
  )
}

const VIRTUALIZE_THRESHOLD = 50
const ROW_HEIGHT_PX = 56
const VIRTUALIZED_VIEWPORT_PX = 400
