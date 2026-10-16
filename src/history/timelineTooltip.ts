import type { HistoryHook, HistoryRow } from '../api/history'
import { activeLotAt, formatUtcInstant } from './timelineData'

/**
 * KAN-174 (FR13) — formats one marker's tooltip fields, in the exact CB22
 * order: measurement date/time (UTC), lat/lon (6 decimals), ambient temp,
 * humidity, mass, acceleration, MPU temp, and — only when a lot hook is
 * active for that device at that instant — client lot, cPAL lot, expiry
 * (if present), quantity (if present). Pure/independently-testable
 * (NFR3-adjacent: no DOM/map needed), mirroring `positionTooltip.ts`'s
 * (KAN-160) pattern for Live Tracking's own marker tooltip.
 */
export interface TimelineTooltipField {
  label: string
  value: string
}

const DASH = '—'

function fixed(value: number | null, digits: number, unit: string): string {
  if (value === null || Number.isNaN(value)) return DASH
  return `${value.toFixed(digits)}${unit}`
}

export function formatTimelineTooltip(row: HistoryRow, hooks: HistoryHook[]): TimelineTooltipField[] {
  const fields: TimelineTooltipField[] = [
    { label: 'Date de mesure', value: formatUtcInstant(row.t) },
    {
      label: 'Position',
      value: row.la !== null && row.lo !== null ? `${row.la.toFixed(6)}, ${row.lo.toFixed(6)}` : DASH,
    },
    { label: 'Température amb.', value: fixed(row.ta, 2, ' °C') },
    { label: 'Humidité', value: fixed(row.hr, 1, ' %') },
    { label: 'Masse', value: row.m === null || Number.isNaN(row.m) ? 'non mesuré' : `${row.m.toFixed(2)} kg` },
    { label: 'Accélération', value: fixed(row.g, 3, ' G') },
    { label: 'Température MPU', value: fixed(row.tm, 2, ' °C') },
  ]

  const hook = activeLotAt(hooks, row.c, row.t)
  if (hook) {
    fields.push({ label: 'Lot client', value: hook.cust ?? DASH })
    fields.push({ label: 'Lot cPAL', value: String(hook.lot) })
    if (hook.per) fields.push({ label: 'Péremption', value: hook.per })
    if (hook.nb !== null && hook.nb !== undefined) fields.push({ label: 'Quantité', value: String(hook.nb) })
  }

  return fields
}
