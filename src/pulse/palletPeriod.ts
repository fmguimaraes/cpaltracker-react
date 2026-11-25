import type { HistoryHook, HistoryRow } from '../api/history'

export const DAY_MS = 24 * 60 * 60_000

/** The metrics of the pallet drawer's "Période" section (ported from Historique's selection summary). */
export type PeriodMetric = 'ta' | 'hr' | 'm'

export const PERIOD_METRICS: { key: PeriodMetric; label: string; unit: string }[] = [
  { key: 'ta', label: 'Température', unit: '°C' },
  { key: 'hr', label: 'Humidité', unit: '%HR' },
  { key: 'm', label: 'Poids', unit: 'kg' },
]

export interface PalletPeriodStats {
  /** Readings of the pallet in the period. */
  count: number
  /** Temperature range over the period; null without a temperature reading. */
  temperature: { min: number; max: number } | null
  /**
   * Per metric, last value − the value 24 h before it (the last reading at or before that instant); only the
   * metrics with both readings.
   */
  deltas: { key: PeriodMetric; label: string; unit: string; delta: number }[]
}

/** The pallet's readings in `range`, ascending. */
function readingsOf(rows: readonly HistoryRow[], chipId: string, range: { from: Date; to: Date }): HistoryRow[] {
  const from = range.from.getTime()
  const to = range.to.getTime()
  return rows.filter((row) => row.c === chipId && row.t >= from && row.t <= to).sort((a, b) => a.t - b.t)
}

/** The "Période" figures of one pallet, or null when it has no reading in the period. */
export function palletPeriodStats(rows: readonly HistoryRow[], chipId: string, range: { from: Date; to: Date }): PalletPeriodStats | null {
  const readings = readingsOf(rows, chipId, range)
  if (readings.length === 0) return null
  const temperatures = readings.map((row) => row.ta).filter((value): value is number => value !== null)
  const deltas: PalletPeriodStats['deltas'] = []
  for (const metric of PERIOD_METRICS) {
    const withValue = readings.filter((row) => row[metric.key] !== null)
    const last = withValue[withValue.length - 1]
    if (!last) continue
    const before = withValue.filter((row) => row.t <= last.t - DAY_MS).pop()
    if (!before) continue
    deltas.push({ ...metric, delta: (last[metric.key] as number) - (before[metric.key] as number) })
  }
  return {
    count: readings.length,
    temperature: temperatures.length > 0 ? { min: Math.min(...temperatures), max: Math.max(...temperatures) } : null,
    deltas,
  }
}

/** The pallet's lot attach history (most recent first). */
export function palletLotHooks(hooks: readonly HistoryHook[], chipId: string): HistoryHook[] {
  return hooks.filter((hook) => hook.c === chipId).sort((a, b) => b.from - a.from)
}

/** A hook's end far in the future (the backend's open-ended sentinel) or after `now`: still attached. */
export function isOngoingHook(hook: Pick<HistoryHook, 'to'>, now: Date): boolean {
  return !Number.isFinite(hook.to) || hook.to > now.getTime()
}
