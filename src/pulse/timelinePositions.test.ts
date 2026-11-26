import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../api/history'
import type { Position } from '../api/positions'
import { buildDeviceSeries } from '../history/timelineData'
import { filterByLastReport } from '../live-tracking/lastReportFilter'
import { editRange, inViewport, positionsAt, reportWindow, resolveRangeChoice, toDateInput, trailsAt } from './timelinePositions'

const position = (chipId: string, latitude: number | null = 48.8, longitude: number | null = 2.3): Position => ({
  contractId: 1, chipId, timestamp: '2026-11-24T10:00:00Z', latitude, longitude,
  ambientTemperature: 20, humidity: 50, mass: 300, mpuTemperature: 21, accelG: 1, lot: null,
})
const row = (c: string, t: number, la: number | null, lo: number | null, m = 100): HistoryRow => ({
  c, t, ts: '', p: la === null ? 0 : 1, la, lo, ta: 1, hr: 2, m, g: 3, tm: 4,
})

describe('resolveRangeChoice', () => {
  it('a preset ends at now; typed dates cover whole local days', () => {
    const now = new Date(2026, 10, 25, 12)
    expect(resolveRangeChoice({ kind: 'preset', days: '7' }, now)).toEqual({ from: new Date(2026, 10, 18, 12), to: now })
    expect(resolveRangeChoice({ kind: 'custom', start: '2026-11-01', end: '2026-11-03' }, now)).toEqual({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 3, 23, 59, 59, 999),
    })
  })
})

describe('editRange', () => {
  const current = { from: new Date(2026, 10, 1, 9), to: new Date(2026, 10, 25, 9) }
  it('turns an edit into custom dates, keeping the other bound', () => {
    expect(editRange(current, 'start', '2026-11-10')).toEqual({ kind: 'custom', start: '2026-11-10', end: '2026-11-25' })
    expect(editRange(current, 'end', '2026-11-20')).toEqual({ kind: 'custom', start: '2026-11-01', end: '2026-11-20' })
  })
  it('moves the other bound instead of inverting the range or exceeding one year', () => {
    expect(editRange(current, 'start', '2026-12-05')).toEqual({ kind: 'custom', start: '2026-12-05', end: '2026-12-05' })
    expect(editRange(current, 'end', '2026-10-01')).toEqual({ kind: 'custom', start: '2026-10-01', end: '2026-10-01' })
    expect(editRange(current, 'start', '2025-01-01')).toEqual({ kind: 'custom', start: '2025-01-01', end: '2026-01-01' })
  })
  it('ignores an empty or invalid value', () => {
    expect(editRange(current, 'start', '')).toBeNull()
    expect(editRange(current, 'end', '2026-02-31')).toBeNull()
  })
  it('round-trips through the date input format', () => {
    expect(toDateInput(new Date(2026, 0, 5, 23))).toBe('2026-01-05')
  })
})

describe('positionsAt', () => {
  const byDevice = buildDeviceSeries([
    row('A', 100, 45, 4, 250),
    row('A', 200, null, null),
    row('A', 300, 46, 5, 600),
    row('B', 250, 43, 5),
  ])
  it('puts each pallet at its last geolocated row at or before the instant, with that row’s measures', () => {
    const [a, b] = positionsAt([position('A'), position('B'), position('C')], byDevice, 260)
    expect(a).toMatchObject({ chipId: 'A', latitude: 45, longitude: 4, mass: 250, timestamp: new Date(100).toISOString() })
    expect(b).toMatchObject({ chipId: 'B', latitude: 43, longitude: 5 })
  })
  it('leaves out pallets without a position yet', () => {
    expect(positionsAt([position('A'), position('B')], byDevice, 150).map((p) => p.chipId)).toEqual(['A'])
    expect(positionsAt([position('A')], byDevice, 50)).toEqual([])
  })
})

describe('trailsAt', () => {
  const byDevice = buildDeviceSeries([
    row('A', 50, 44, 3),
    row('A', 100, 45, 4),
    row('A', 200, null, null),
    row('A', 300, 46, 5),
    row('A', 400, 47, 6),
    row('B', 250, 43, 5),
    row('B', 350, 42, 6),
  ])
  it('gives each pallet its positioned path from the start of the period up to the instant', () => {
    expect(trailsAt([position('A'), position('B'), position('C')], byDevice, 100, 360)).toEqual([
      { id: 'A', points: [[45, 4], [46, 5]] },
      { id: 'B', points: [[43, 5], [42, 6]] },
    ])
  })
  it('stops at the instant and starts at the period: fewer than two points make no trail', () => {
    expect(trailsAt([position('A'), position('B')], byDevice, 100, 299)).toEqual([])
    expect(trailsAt([position('A')], byDevice, 0, 299)).toEqual([{ id: 'A', points: [[44, 3], [45, 4]] }])
    expect(trailsAt([position('A')], byDevice, 301, 1000)).toEqual([])
  })
  it('only follows the pallets given (lot filter, what the map draws)', () => {
    expect(trailsAt([position('B')], byDevice, 0, 1000).map((t) => t.id)).toEqual(['B'])
  })
})

describe('inViewport', () => {
  const paris = { north: 49, south: 48.5, east: 2.6, west: 2 }
  it('tests the position against the bounds, edges included; no bounds yet means in view', () => {
    expect(inViewport(position('A'), paris)).toBe(true)
    expect(inViewport(position('A', 49, 2.6), paris)).toBe(true)
    expect(inViewport(position('A', 43.3, 5.4), paris)).toBe(false)
    expect(inViewport(position('A'), null)).toBe(true)
    expect(inViewport(position('A', null, null), null)).toBe(false)
  })
})

describe('period in the URL (unified shell §1.3)', () => {
  it('round-trips the presets and custom days; rejects garbage', async () => {
    const { periodParam, parsePeriodParam, choiceOfPreset, presetOfChoice } = await import('./timelinePositions')
    for (const preset of ['24h', '7d', '15d', '30d'] as const) {
      const choice = choiceOfPreset(preset)
      expect(presetOfChoice(choice)).toBe(preset)
      expect(parsePeriodParam(periodParam(choice))).toEqual(choice)
    }
    expect(['24h', '7d', '15d', '30d'].map((p) => periodParam(choiceOfPreset(p as '7d')))).toEqual(['1j', '7j', '15j', '1mois'])
    // Links written with the earlier params still read.
    expect(parsePeriodParam('24h')).toEqual(choiceOfPreset('24h'))
    expect(parsePeriodParam('30j')).toEqual(choiceOfPreset('30d'))
    const custom = { kind: 'custom' as const, start: '2026-11-01', end: '2026-11-10' }
    expect(periodParam(custom)).toBe('2026-11-01_2026-11-10')
    expect(parsePeriodParam('2026-11-01_2026-11-10')).toEqual(custom)
    expect(parsePeriodParam('2026-11-10_2026-11-01')).toBeNull()
    expect(parsePeriodParam('3j')).toBeNull()
    expect(parsePeriodParam(null)).toBeNull()
  })

  it('formats the instant in local French, never ISO', async () => {
    const { formatInstant } = await import('./timelinePositions')
    const now = new Date(2026, 10, 25, 12, 0)
    expect(formatInstant(new Date(2026, 10, 15, 11, 0).getTime(), now)).toMatch(/^15\snov\.\s11:00$/)
  })
})

describe('reportWindow (KAN-350)', () => {
  const now = new Date('2026-11-26T10:00:00Z')
  const ahead = (chipId: string, iso: string): Position => ({ ...position(chipId), timestamp: iso })
  // Data dated in the future (the demo runs to 2029, EC11) or a browser clock behind: the latest reports are
  // "after" the load time and must still be drawn.
  const positions = [
    ahead('a', '2026-11-26T11:30:00Z'),
    ahead('b', '2026-11-26T12:00:00Z'),
    ahead('future', '2029-06-01T00:00:00Z'),
    ahead('old', '2026-10-01T00:00:00Z'),
  ]

  it('a preset keeps the reports stamped after the load time (the map no longer empties)', () => {
    const choice = { kind: 'preset' as const, days: '30' }
    const window = reportWindow(choice, resolveRangeChoice(choice, now))
    expect(filterByLastReport(positions, { preset: 'custom', ...window }).map((p) => p.chipId)).toEqual(['a', 'b', 'future'])
  })

  it('typed calendar days keep their end', () => {
    const choice = { kind: 'custom' as const, start: '2026-11-01', end: '2026-11-03' }
    const range = resolveRangeChoice(choice, now)
    expect(reportWindow(choice, range)).toEqual(range)
  })
})
