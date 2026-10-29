import { describe, expect, it } from 'vitest'
import type { HistoryHook, HistoryRow } from '../api/history'
import {
  activeLotAt,
  allPositionsForFit,
  buildDeviceSeries,
  computeSliderBounds,
  computeVisibleMarkers,
  findLastIndexAtOrBefore,
  formatUtc,
  formatUtcInstant,
  massStatus,
  visibleDeviceOrder,
  replayStepMs,
  trailPositions,
} from './timelineData'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    c: 'CHIP-1',
    t: 0,
    ts: '2026-01-01T00:00:00',
    p: 1,
    la: 43.5,
    lo: 5.4,
    ta: 20,
    hr: 50,
    m: 300,
    g: 1,
    tm: 22,
    ...overrides,
  }
}

describe('buildDeviceSeries (CB19)', () => {
  it('keeps one entry per device in first-seen order, without any colour', () => {
    const rows: HistoryRow[] = Array.from({ length: 11 }, (_, i) =>
      row({ c: `CHIP-${i}`, t: i * 1000 }),
    )
    const byDevice = buildDeviceSeries(rows)
    expect([...byDevice.keys()][0]).toBe('CHIP-0')
    expect(byDevice.size).toBe(11)
    expect(byDevice.get('CHIP-0')).not.toHaveProperty('color')
  })

  it('keeps only geolocated rows (p===1 and non-null la/lo) in a device series', () => {
    const rows: HistoryRow[] = [
      row({ t: 1000, p: 1, la: 1, lo: 1 }),
      row({ t: 2000, p: 0, la: null, lo: null }),
      row({ t: 3000, p: 1, la: null, lo: 2 }),
      row({ t: 4000, p: 1, la: 2, lo: 2 }),
    ]
    const byDevice = buildDeviceSeries(rows)
    const series = byDevice.get('CHIP-1')!.positions
    expect(series.map((r) => r.t)).toEqual([1000, 4000])
  })

  it('creates an (empty) entry for a device with measurements but no position', () => {
    const rows: HistoryRow[] = [row({ t: 1000, p: 0, la: null, lo: null })]
    const byDevice = buildDeviceSeries(rows)
    expect(byDevice.get('CHIP-1')!.positions).toEqual([])
  })
})

describe('computeSliderBounds (CB19)', () => {
  it('spans the first/last row t, with step = max(1000, floor(span/2000))', () => {
    const rows: HistoryRow[] = [row({ t: 1_000_000 }), row({ t: 5_000_000 })]
    expect(computeSliderBounds(rows)).toEqual({ min: 1_000_000, max: 5_000_000, step: 2000 })
  })

  it('floors step at 1000ms for a short span', () => {
    const rows: HistoryRow[] = [row({ t: 0 }), row({ t: 500 })]
    expect(computeSliderBounds(rows).step).toBe(1000)
  })

  it('collapses to a pinned "now" when there are no rows', () => {
    const bounds = computeSliderBounds([])
    expect(bounds.min).toBe(bounds.max)
    expect(bounds.step).toBe(1000)
  })
})

describe('findLastIndexAtOrBefore (CB20)', () => {
  const series: HistoryRow[] = [row({ t: 100 }), row({ t: 200 }), row({ t: 300 })]

  it('finds the last index at or before the instant', () => {
    expect(findLastIndexAtOrBefore(series, 250)).toBe(1)
    expect(findLastIndexAtOrBefore(series, 300)).toBe(2)
    expect(findLastIndexAtOrBefore(series, 999)).toBe(2)
  })

  it('returns -1 when the instant precedes every reading', () => {
    expect(findLastIndexAtOrBefore(series, 50)).toBe(-1)
  })

  it('returns -1 for an empty series', () => {
    expect(findLastIndexAtOrBefore([], 1000)).toBe(-1)
  })
})

describe('activeLotAt (CB22)', () => {
  function hook(overrides: Partial<HistoryHook>): HistoryHook {
    return { c: 'CHIP-1', lot: 1, cust: 'CUST-1', from: 100, to: 200, net: 10, gros: 11, nb: 5, per: null, ...overrides }
  }

  it('matches the half-open interval [from, to)', () => {
    const hooks = [hook({})]
    expect(activeLotAt(hooks, 'CHIP-1', 100)).toBe(hooks[0])
    expect(activeLotAt(hooks, 'CHIP-1', 199)).toBe(hooks[0])
    expect(activeLotAt(hooks, 'CHIP-1', 200)).toBeNull() // "to" is exclusive
    expect(activeLotAt(hooks, 'CHIP-1', 99)).toBeNull()
  })

  it('never matches a different device', () => {
    const hooks = [hook({ c: 'CHIP-OTHER' })]
    expect(activeLotAt(hooks, 'CHIP-1', 150)).toBeNull()
  })
})

describe('massStatus (CB21, F-22)', () => {
  it('thresholds at 200 and 500 mapped to the D3 states, offline for null/NaN', () => {
    expect(massStatus(null)).toBe('offline')
    expect(massStatus(NaN)).toBe('offline')
    expect(massStatus(199)).toBe('alert')
    expect(massStatus(200)).toBe('warning')
    expect(massStatus(499)).toBe('warning')
    expect(massStatus(500)).toBe('ok')
  })
})

describe('visibleDeviceOrder (K-7)', () => {
  const rows: HistoryRow[] = [
    row({ c: 'CHIP-A', t: 1000 }),
    row({ c: 'CHIP-B', t: 2000 }),
    row({ c: 'CHIP-C', t: 3000 }),
  ]
  it('lists every device in first-seen order when nothing is filtered', () => {
    expect(visibleDeviceOrder(rows, null)).toEqual(['CHIP-A', 'CHIP-B', 'CHIP-C'])
  })
  it('keeps first-seen order among the visible devices only', () => {
    expect(visibleDeviceOrder(rows, ['CHIP-C', 'CHIP-A'])).toEqual(['CHIP-A', 'CHIP-C'])
  })
})

describe('computeVisibleMarkers (FR12/CB20)', () => {
  it('omits a visible device with no reading yet at the instant', () => {
    const byDevice = buildDeviceSeries([row({ c: 'CHIP-1', t: 1000 })])
    expect(computeVisibleMarkers(byDevice, null, 500)).toEqual([])
    expect(computeVisibleMarkers(byDevice, null, 1000)).toHaveLength(1)
  })

  it('filters by visibleIds when provided (FR9 contract, no refetch)', () => {
    const byDevice = buildDeviceSeries([row({ c: 'CHIP-1', t: 1000 }), row({ c: 'CHIP-2', t: 1000 })])
    const markers = computeVisibleMarkers(byDevice, ['CHIP-1'], 1000)
    expect(markers.map((m) => m.chipId)).toEqual(['CHIP-1'])
  })
})

describe('trailPositions (CB23)', () => {
  it('returns no points when idx is 0 or less (nothing to draw a line through)', () => {
    const series = [row({ t: 1 })]
    expect(trailPositions(series, 0)).toEqual([])
    expect(trailPositions(series, -1)).toEqual([])
  })

  it('returns points from series start up to and including idx, not the full series', () => {
    const series = [row({ la: 1, lo: 1 }), row({ la: 2, lo: 2 }), row({ la: 3, lo: 3 })]
    expect(trailPositions(series, 1)).toEqual([
      [1, 1],
      [2, 2],
    ])
  })
})

describe('allPositionsForFit (CB25 "Ajuster")', () => {
  it('returns every visible device point across its whole series, not just the current instant', () => {
    const byDevice = buildDeviceSeries([
      row({ c: 'CHIP-1', t: 1, la: 1, lo: 1 }),
      row({ c: 'CHIP-1', t: 2, la: 2, lo: 2 }),
    ])
    expect(allPositionsForFit(byDevice, null)).toEqual([
      [1, 1],
      [2, 2],
    ])
  })

  it('respects visibleIds', () => {
    const byDevice = buildDeviceSeries([row({ c: 'CHIP-1', t: 1, la: 1, lo: 1 }), row({ c: 'CHIP-2', t: 1, la: 9, lo: 9 })])
    expect(allPositionsForFit(byDevice, ['CHIP-1'])).toEqual([[1, 1]])
  })
})

describe('replayStepMs (CB24)', () => {
  it('advances by max(1000, floor(span/200)) ms', () => {
    expect(replayStepMs(0, 400_000)).toBe(2000)
    expect(replayStepMs(0, 100)).toBe(1000)
  })
})

describe('formatUtc', () => {
  it('formats an instant in UTC as AAAA-MM-JJ HH:MM:SS with no suffix (monolith formatUTC)', () => {
    expect(formatUtc(Date.UTC(2026, 11, 31, 23, 59, 7))).toBe('2026-12-31 23:59:07')
  })
})

describe('formatUtcInstant', () => {
  it('formats as AAAA-MM-JJ HH:MM:SS UTC', () => {
    expect(formatUtcInstant(Date.UTC(2026, 0, 5, 8, 9, 3))).toBe('2026-01-05 08:09:03 UTC')
  })
})
