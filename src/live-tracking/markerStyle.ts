/**
 * KAN-160 (FR5/FR6) — pure, independently-testable marker styling. Kept
 * out of `PositionsMap.tsx` so these rules never need a Leaflet/DOM render
 * to unit-test (NFR8).
 */

/** A fixed, colour-blind-friendlier palette (NFR7: colour is never the
 * only state signal — the tooltip always carries the raw numeric value
 * too — but distinct hues still need to stay tellable apart). */
const BORDER_PALETTE = [
  '#1d4ed8', // blue
  '#b45309', // amber
  '#7c3aed', // violet
  '#0f766e', // teal
  '#be123c', // rose
  '#4d7c0f', // olive
  '#0369a1', // sky
  '#9333ea', // purple
] as const

/**
 * FR5 — fill colour from the device's latest mass. `null`/`NaN` (no
 * reading, or a non-numeric value that slipped through) is grey, never
 * silently treated as any particular threshold bucket.
 */
export function massFillColor(mass: number | null): string {
  if (mass === null || Number.isNaN(mass)) return '#9aa1a9'
  if (mass < 200) return '#dc2626'
  if (mass < 500) return '#f59e0b'
  return '#16a34a'
}

/**
 * FR6 — stable per-device border colour. Deterministic by `chipId` (a
 * simple string hash into the fixed palette) rather than first-seen
 * insertion order, so it is stable across refreshes AND across sessions —
 * stricter than the AC's "stable across refreshes" actually requires, and
 * avoids any module-level mutable cache that would otherwise need to be
 * reset when the selected contract changes.
 */
export function deviceBorderColor(chipId: string): string {
  let hash = 0
  for (let i = 0; i < chipId.length; i++) {
    hash = (hash * 31 + chipId.charCodeAt(i)) >>> 0
  }
  return BORDER_PALETTE[hash % BORDER_PALETTE.length]
}
