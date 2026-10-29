/**
 * KAN-160 (FR5/FR6) — pure, independently-testable marker styling. Kept
 * out of `PositionsMap.tsx` so these rules never need a Leaflet/DOM render
 * to unit-test (NFR8).
 */

import type { DeviceStatus } from '@/ui/status'

/**
 * FR8 — the mass thresholds of FR5 mapped to the four device states of the
 * kit (D3): no reading -> offline, < 200 -> alert, < 500 -> warning, else ok.
 * Expressed as a state so the kit
 * (marker ring, badge, donut) owns every colour.
 */
export function massStatus(mass: number | null): DeviceStatus {
  if (mass === null || Number.isNaN(mass)) return 'offline'
  if (mass < 200) return 'alert'
  if (mass < 500) return 'warning'
  return 'ok'
}
