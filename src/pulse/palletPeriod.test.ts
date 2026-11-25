import { describe, expect, it } from 'vitest'
import type { HistoryHook, HistoryRow } from '../api/history'
import { DAY_MS, isOngoingHook, palletLotHooks, palletPeriodStats } from './palletPeriod'

const T0 = Date.UTC(2026, 10, 1)
const row = (c: string, t: number, ta: number | null, hr: number | null, m: number | null): HistoryRow =>
  ({ c, t, ts: '', p: 1, la: null, lo: null, ta, hr, m, g: null, tm: null }) as HistoryRow
const range = { from: new Date(T0), to: new Date(T0 + 10 * DAY_MS) }

describe('palletPeriodStats', () => {
  it('counts the pallet’s readings in the period, its temperature range and the Δ24h per metric', () => {
    const rows = [
      row('A', T0 + DAY_MS, 4, 50, 300),
      row('A', T0 + 2 * DAY_MS, 6, 55, 290),
      row('A', T0 + 3 * DAY_MS, 9, null, 280),
      row('B', T0 + 2 * DAY_MS, 30, 10, 1),
      row('A', T0 - DAY_MS, -10, 0, 0), // before the period
    ]
    const stats = palletPeriodStats(rows, 'A', range)!
    expect(stats.count).toBe(3)
    expect(stats.temperature).toEqual({ min: 4, max: 9 })
    // ta: 9 (day 3) − 6 (day 2); hr: last is day 2 (55), nothing 24 h before it but day 1 (50); m: 280 − 290.
    expect(stats.deltas).toEqual([
      { key: 'ta', label: 'Température', unit: '°C', delta: 3 },
      { key: 'hr', label: 'Humidité', unit: '%HR', delta: 5 },
      { key: 'm', label: 'Poids', unit: 'kg', delta: -10 },
    ])
  })

  it('no Δ without a reading 24 h before the last; null without any reading', () => {
    const stats = palletPeriodStats([row('A', T0 + DAY_MS, 4, null, null), row('A', T0 + DAY_MS + 3_600_000, 5, null, null)], 'A', range)!
    expect(stats.deltas).toEqual([])
    expect(stats.temperature).toEqual({ min: 4, max: 5 })
    expect(palletPeriodStats([row('B', T0 + DAY_MS, 4, null, null)], 'A', range)).toBeNull()
  })
})

describe('palletLotHooks', () => {
  const hook = (c: string, from: number, to: number): HistoryHook => ({ c, lot: 7, cust: 'L-1', from, to, net: null, gros: null, nb: null, per: null })
  it('keeps the pallet’s hooks, most recent first', () => {
    const hooks = [hook('A', T0, T0 + DAY_MS), hook('B', T0, T0 + DAY_MS), hook('A', T0 + 2 * DAY_MS, T0 + 3 * DAY_MS)]
    expect(palletLotHooks(hooks, 'A').map((h) => h.from)).toEqual([T0 + 2 * DAY_MS, T0])
  })
  it('a hook ending after now is ongoing', () => {
    expect(isOngoingHook({ to: T0 + DAY_MS }, new Date(T0))).toBe(true)
    expect(isOngoingHook({ to: T0 }, new Date(T0 + DAY_MS))).toBe(false)
  })
})
