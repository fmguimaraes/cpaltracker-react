import type { Position } from '../api/positions'

/**
 * KAN-160 (FR7) — formats one device's reading into the ordered list of
 * text fields the tooltip renders. Pure/independently-testable (NFR8), so
 * the actual `<Tooltip>` JSX only needs to map this array, never compute
 * display text itself. Values are always plain strings — the tooltip
 * renders every one as text content, never `dangerouslySetInnerHTML`
 * (NFR6).
 *
 * Batch/lot fields (FR7's "plus batch/lot when a hook covers that
 * instant") are deliberately omitted here: that data comes only from
 * `GET /contracts/{id}/history`, which this story's data source
 * (`GET /devices/positions.php`) does not return. Cross-referencing a
 * live position against a history hook is out of this story's scope —
 * logged as a follow-up for whichever Live Tracking story first needs it.
 */
export interface TooltipField {
  label: string
  value: string
}

const UNKNOWN = 'Inconnu(e)'

function formatUtc(timestamp: string | null): string {
  if (timestamp === null) return UNKNOWN
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return UNKNOWN
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
}

function formatNumber(value: number | null, unit: string): string {
  if (value === null || Number.isNaN(value)) return UNKNOWN
  return `${value} ${unit}`
}

export function formatPositionTooltip(position: Position): TooltipField[] {
  return [
    { label: 'Date', value: formatUtc(position.timestamp) },
    {
      label: 'Position',
      value:
        position.latitude !== null && position.longitude !== null
          ? `${position.latitude}, ${position.longitude}`
          : UNKNOWN,
    },
    { label: 'Température ambiante', value: formatNumber(position.ambientTemperature, '°C') },
    { label: 'Humidité', value: formatNumber(position.humidity, '%') },
    { label: 'Masse', value: formatNumber(position.mass, 'kg') },
    { label: 'Accélération', value: formatNumber(position.accelG, 'g') },
    { label: 'Température MPU', value: formatNumber(position.mpuTemperature, '°C') },
  ]
}
