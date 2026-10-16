import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../api/history'
import { computeSelectionSummary } from './selectionSummary'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    c: 'CHIP-1',
    t: 0,
    ts: '2026-01-01T00:00:00',
    p: 1,
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

describe('computeSelectionSummary (KAN-175 FR24, CB28)', () => {
  it('counts measurements and distinct devices over the selection', () => {
    const rows = [row({ c: 'CHIP-A', ta: 10 }), row({ c: 'CHIP-A', ta: 12 }), row({ c: 'CHIP-B', ta: 5 })]
    const summary = computeSelectionSummary(rows, null)
    expect(summary.measurementCount).toBe(3)
    expect(summary.deviceCount).toBe(2)
  })

  it('computes min/max ambient temperature to one decimal', () => {
    const rows = [row({ ta: 18.26 }), row({ ta: 22.94 }), row({ ta: 20 })]
    const summary = computeSelectionSummary(rows, null)
    expect(summary.minAmbientTemp).toBe(18.3)
    expect(summary.maxAmbientTemp).toBe(22.9)
  })

  it('returns null extrema when no selected row has a non-null ambient temperature', () => {
    const rows = [row({ ta: null }), row({ ta: Number.NaN })]
    const summary = computeSelectionSummary(rows, null)
    expect(summary.minAmbientTemp).toBeNull()
    expect(summary.maxAmbientTemp).toBeNull()
  })

  it('recomputes over only the currently selected devices', () => {
    const rows = [row({ c: 'CHIP-A', ta: 10 }), row({ c: 'CHIP-B', ta: 50 })]
    const summary = computeSelectionSummary(rows, ['CHIP-A'])
    expect(summary.measurementCount).toBe(1)
    expect(summary.deviceCount).toBe(1)
    expect(summary.maxAmbientTemp).toBe(10)
  })

  it('an empty explicit selection yields a zeroed summary with no extrema', () => {
    const rows = [row({ c: 'CHIP-A', ta: 10 })]
    const summary = computeSelectionSummary(rows, [])
    expect(summary).toEqual({
      measurementCount: 0,
      deviceCount: 0,
      minAmbientTemp: null,
      maxAmbientTemp: null,
    })
  })
})
