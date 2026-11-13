import { describe, expect, it } from 'vitest'
import type { Position } from '../api/positions'
import { filterByLastReport } from './lastReportFilter'

const now = new Date('2026-10-29T12:00:00Z')
const pos = (chipId: string, timestamp: string | null) => ({ chipId, timestamp }) as Position

describe('filterByLastReport', () => {
  const positions = [
    pos('recent', '2026-10-29T11:00:00Z'),
    pos('yesterday', '2026-10-28T13:00:00Z'),
    pos('old', '2026-10-20T12:00:00Z'),
    pos('none', null),
    pos('bad', 'not a date'),
  ]

  it('keeps devices whose latest report is inside a rolling preset', () => {
    expect(filterByLastReport(positions, { preset: '24h' }, now).map((p) => p.chipId)).toEqual(['recent', 'yesterday'])
    expect(filterByLastReport(positions, { preset: '1h' }, now).map((p) => p.chipId)).toEqual(['recent'])
    expect(filterByLastReport(positions, { preset: '30d' }, now).map((p) => p.chipId)).toEqual([
      'recent',
      'yesterday',
      'old',
    ])
  })

  it('supports a custom range and returns nothing when no device reported in it', () => {
    const custom = { preset: 'custom' as const, from: new Date('2026-10-19T00:00:00Z'), to: new Date('2026-10-21T00:00:00Z') }
    expect(filterByLastReport(positions, custom, now).map((p) => p.chipId)).toEqual(['old'])
    expect(filterByLastReport(positions, { preset: '30m' }, now)).toEqual([])
  })
})
