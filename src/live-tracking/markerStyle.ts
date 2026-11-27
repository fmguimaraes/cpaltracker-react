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

/**
 * Pulse (owner 2026-11-27): the state by remaining weight in % of the pallet's initial weight — ok >= 50 %,
 * warning >= 20 %, alert below; offline with no reading or no usable initial weight. The backend computes it
 * (`weightStatus`, api/v1/contracts/pulse.php, cpal_pulse_statut_poids); this mirror only serves playback,
 * where a past reading is set against the snapshot's initial weight. Keep both in step.
 */
export const WEIGHT_OK_PERCENT = 50
export const WEIGHT_WARNING_PERCENT = 20

export function weightState(
  mass: number | null,
  initialWeight: number | null,
): { remainingPercent: number | null; weightStatus: DeviceStatus } {
  if (mass === null || Number.isNaN(mass) || initialWeight === null || initialWeight <= 0) {
    return { remainingPercent: null, weightStatus: 'offline' }
  }
  const remainingPercent = Math.round((mass / initialWeight) * 1000) / 10
  const weightStatus =
    remainingPercent >= WEIGHT_OK_PERCENT ? 'ok' : remainingPercent >= WEIGHT_WARNING_PERCENT ? 'warning' : 'alert'
  return { remainingPercent, weightStatus }
}

/** A position's state: the backend's weight state when given (Pulse), else the kg thresholds (Live Tracking). */
export function positionStatus(p: { mass: number | null; weightStatus?: DeviceStatus }): DeviceStatus {
  return p.weightStatus ?? massStatus(p.mass)
}
