import type { Position } from '../api/positions'
import { resolveRange, type TimeRangeValue } from '@/ui/patterns/time-picker'

/** Operator decision 2026-10-29: Live Tracking opens on the kit `TimePicker`'s "30 j" (30 days) preset. */
export const DEFAULT_LIVE_PERIOD: TimeRangeValue = { preset: '30d' }

/**
 * "Filter by last report" — the positions API only returns each device's latest position, so the period
 * is applied client-side: keep the devices whose latest `timestamp` falls inside the period (bounds
 * inclusive). A position without a (parsable) timestamp has no report to place in time and is dropped.
 */
export function filterByLastReport(positions: Position[], period: TimeRangeValue, now: Date = new Date()): Position[] {
  const { from, to } = resolveRange(period, now)
  return positions.filter((p) => {
    if (p.timestamp === null) return false
    const t = new Date(p.timestamp).getTime()
    return !Number.isNaN(t) && t >= from.getTime() && t <= to.getTime()
  })
}
