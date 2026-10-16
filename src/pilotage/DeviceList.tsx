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
  if (devices.length === 0) {
    return (
      <p data-testid="pilotage-devices-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucun device trouvé pour ce contrat.
      </p>
    )
  }

  return (
    <ul data-testid="pilotage-device-list" className="flex flex-col gap-2">
      {devices.map((device) => {
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
      })}
    </ul>
  )
}
