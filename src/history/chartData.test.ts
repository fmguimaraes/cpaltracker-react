import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../api/history'
import { buildChartTraces } from './chartData'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    c: 'CHIP-1',
    t: 0,
    ts: '2026-01-01T00:00:00',
    p: 0,
    la: null,
    lo: null,
    ta: null,
    hr: null,
    m: null,
    g: null,
    tm: null,
    ...overrides,
  }
}

describe('buildChartTraces (KAN-175 FR19, FR20, CB26, CB27)', () => {
  it('builds one trace per device, numeric x = epoch ms, y = the requested field', () => {
    const rows = [
      row({ c: 'CHIP-A', t: 1000, ta: 20 }),
      row({ c: 'CHIP-A', t: 2000, ta: 21 }),
      row({ c: 'CHIP-B', t: 1500, ta: 30 }),
    ]
    const traces = buildChartTraces(rows, null, 'ta')
    expect(traces).toHaveLength(2)
    const a = traces.find((t) => t.chipId === 'CHIP-A')!
    expect(a.x).toEqual([1000, 2000])
    expect(a.y).toEqual([20, 21])
  })

  it('filters out null and NaN values for the field, without dropping the whole device', () => {
    const rows = [
      row({ c: 'CHIP-A', t: 1000, ta: 20 }),
      row({ c: 'CHIP-A', t: 2000, ta: null }),
      row({ c: 'CHIP-A', t: 3000, ta: Number.NaN }),
      row({ c: 'CHIP-A', t: 4000, ta: 22 }),
    ]
    const traces = buildChartTraces(rows, null, 'ta')
    expect(traces).toHaveLength(1)
    expect(traces[0].x).toEqual([1000, 4000])
    expect(traces[0].y).toEqual([20, 22])
  })

  it('omits a device entirely when it has no non-null reading for the field', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: null })]
    expect(buildChartTraces(rows, null, 'ta')).toEqual([])
  })

  it('respects visibleIds, excluding devices not in the selection', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 20 }), row({ c: 'CHIP-B', t: 1000, ta: 30 })]
    const traces = buildChartTraces(rows, ['CHIP-A'], 'ta')
    expect(traces.map((t) => t.chipId)).toEqual(['CHIP-A'])
  })

  it('assigns the same color a device gets on the map (palette, first-seen order)', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 20, m: 100 }), row({ c: 'CHIP-B', t: 1000, hr: 50, m: 100 })]
    const tempTraces = buildChartTraces(rows, null, 'ta')
    const massTraces = buildChartTraces(rows, null, 'm')
    const chipAColorInTemp = tempTraces.find((t) => t.chipId === 'CHIP-A')!.color
    const chipAColorInMass = massTraces.find((t) => t.chipId === 'CHIP-A')!.color
    expect(chipAColorInTemp).toBe(chipAColorInMass)
  })

  it('sorts points ascending by t even if rows arrive out of order', () => {
    const rows = [row({ c: 'CHIP-A', t: 3000, ta: 1 }), row({ c: 'CHIP-A', t: 1000, ta: 2 })]
    const traces = buildChartTraces(rows, null, 'ta')
    expect(traces[0].x).toEqual([1000, 3000])
  })
})
