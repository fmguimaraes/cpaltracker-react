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
 */
export function DeviceList({ devices }: { devices: Position[] }) {
  if (devices.length === 0) {
    return (
      <p data-testid="pilotage-devices-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucun device trouvé pour ce contrat.
      </p>
    )
  }

  return (
    <ul data-testid="pilotage-device-list" className="flex flex-col gap-2">
      {devices.map((device) => (
        <li
          key={device.chipId}
          data-testid={`pilotage-device-${device.chipId}`}
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
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
        </li>
      ))}
    </ul>
  )
}
