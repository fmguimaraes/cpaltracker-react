import type { MapLoadLevel } from '@/ui/map'

/**
 * Remaining-load ramp (Pulse): a pallet's weight relative to the heaviest pallet of the contract's
 * snapshot ("charge pleine"), in 5 steps from empty (1) to full load (5). The contract has no per-pallet
 * capacity, so the reference is the fleet's own maximum.
 */
export const LOAD_LEVELS = 5

/** The heaviest known weight among these positions, or null when none has a weight above 0. */
export function maxMass(positions: readonly { mass: number | null }[]): number | null {
  const masses = positions.map((p) => p.mass).filter((m): m is number => m !== null && m > 0)
  return masses.length ? Math.max(...masses) : null
}

/** 1 (empty) … 5 (full load); null when the weight or the reference is unknown. */
export function loadLevel(mass: number | null, max: number | null): MapLoadLevel | null {
  if (mass === null || max === null || max <= 0) return null
  const ratio = Math.min(Math.max(mass / max, 0), 1)
  return Math.max(1, Math.ceil(ratio * LOAD_LEVELS)) as MapLoadLevel
}
