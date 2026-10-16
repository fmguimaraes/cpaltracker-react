import { describe, expect, it } from 'vitest'
import type { HistoryHook, HistoryRow } from '../api/history'
import {
  activeLotAt,
  allPositionsForFit,
  buildDeviceSeries,
  computeSliderBounds,
  computeVisibleMarkers,
  DEVICE_PALETTE,
  findLastIndexAtOrBefore,
  formatUtcInstant,
  massFillColor,
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
  it('assigns one palette color per device in first-seen order, wrapping past 10', () => {
    const rows: HistoryRow[] = Array.from({ length: 11 }, (_, i) =>
      row({ c: `CHIP-${i}`, t: i * 1000 }),
    )
    const byDevice = buildDeviceSeries(rows)
    expect(byDevice.get('CHIP-0')!.color).toBe(DEVICE_PALETTE[0])
    expect(byDevice.get('CHIP-9')!.color).toBe(DEVICE_PALETTE[9])
    expect(byDevice.get('CHIP-10')!.color).toBe(DEVICE_PALETTE[0]) // wraps
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

describe('massFillColor (CB21)', () => {
  it('thresholds at 200 and 500, grey for null/NaN', () => {
    expect(massFillColor(null)).toBe('#9e9e9e')
    expect(massFillColor(NaN)).toBe('#9e9e9e')
    expect(massFillColor(199)).toBe('#c62828')
    expect(massFillColor(200)).toBe('#ef6c00')
    expect(massFillColor(499)).toBe('#ef6c00')
    expect(massFillColor(500)).toBe('#2e7d32')
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

describe('formatUtcInstant', () => {
  it('formats as AAAA-MM-JJ HH:MM:SS UTC', () => {
    expect(formatUtcInstant(Date.UTC(2026, 0, 5, 8, 9, 3))).toBe('2026-01-05 08:09:03 UTC')
  })
})
