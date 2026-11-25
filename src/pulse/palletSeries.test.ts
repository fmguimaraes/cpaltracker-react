import { describe, expect, it } from 'vitest'
import type { AnomalyRow } from '../api/anomalies'
import type { HistoryRow } from '../api/history'
import {
  anomaliesInRange,
  breakAtGaps,
  coverageNote,
  dataExtent,
  expectedInterval,
  extentLabels,
  isStale,
  medianInterval,
  PALLET_MEASURES,
  palletSeries,
  ruleThresholds,
  niceStep,
  yDomain,
  yLabels,
} from './palletSeries'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return { c: 'A', t: 0, ts: '', p: 0, la: null, lo: null, ta: null, hr: null, m: null, g: null, tm: null, ...overrides }
}

function anomaly(overrides: Partial<AnomalyRow>): AnomalyRow {
  return {
    anomalyKey: 'K',
    status: 'detectee',
    code: 'TH',
    label: '',
    threshold: 28,
    value: 31,
    excess: 3,
    unit: '°C',
    eventDate: '2026-11-14 09:00:00',
    detectedAt: '2026-11-14 09:00:00',
    chipId: 'A',
    lot: null,
    ...overrides,
  }
}

const range = { from: new Date(1000), to: new Date(5000) }
const HOUR = 3_600_000

describe('palletSeries', () => {
  it('keeps only this device, inside the range, with a value, sorted by time', () => {
    const rows = [
      row({ t: 3000, m: 400 }),
      row({ t: 2000, m: 600 }),
      row({ t: 2500, m: null }),
      row({ c: 'B', t: 2200, m: 50 }),
      row({ t: 500, m: 900 }),
      row({ t: 6000, m: 10 }),
    ]
    expect(palletSeries(rows, 'A', 'm', range)).toEqual({ t: [2000, 3000], values: [600, 400], last: 400 })
  })

  it('includes both range bounds', () => {
    const rows = [row({ t: 1000, g: 0.5 }), row({ t: 5000, g: 1.25 })]
    expect(palletSeries(rows, 'A', 'g', range).values).toEqual([0.5, 1.25])
  })

  it('has no last value when the device has no reading of that measure', () => {
    expect(palletSeries([row({ t: 2000, m: 300 })], 'A', 'hr', range)).toEqual({ t: [], values: [], last: null })
  })
})

describe('PALLET_MEASURES', () => {
  it('lists Température, Humidité, Accélération, Poids in order, with the cards’ units', () => {
    expect(PALLET_MEASURES.map((m) => [m.label, m.unit])).toEqual([
      ['Température', '°C'],
      ['Humidité', '%HR'],
      ['Accélération', 'g'],
      ['Poids', 'kg'],
    ])
  })

  it('draws acceleration as discrete stems, the others as lines', () => {
    expect(PALLET_MEASURES.map((m) => m.style)).toEqual(['line', 'line', 'stems', 'line'])
  })

  it('carries no hard-coded threshold', () => {
    expect(PALLET_MEASURES.every((m) => !('thresholds' in m))).toBe(true)
  })
})

describe('medianInterval / expectedInterval / isStale', () => {
  it('takes the median step between readings', () => {
    expect(medianInterval([0, 10, 20, 30, 100])).toBe(10)
    expect(medianInterval([0, 10, 30])).toBe(15)
    expect(medianInterval([5])).toBeNull()
  })

  it('expects 2× the median interval of the pallet’s own readings, any measure', () => {
    const rows = [row({ t: 0 }), row({ t: HOUR }), row({ t: HOUR }), row({ t: 2 * HOUR }), row({ c: 'B', t: 90 })]
    expect(expectedInterval(rows, 'A')).toBe(2 * HOUR)
    expect(expectedInterval([row({ t: 0 })], 'A')).toBeNull()
  })

  it('is stale only past the expected interval, and never without one', () => {
    const last = new Date('2026-11-15T11:00:00Z')
    expect(isStale(last, new Date('2026-11-15T12:30:00Z'), 2 * HOUR)).toBe(false)
    expect(isStale(last, new Date('2026-11-15T13:30:00Z'), 2 * HOUR)).toBe(true)
    expect(isStale(last, new Date('2026-11-25T11:00:00Z'), null)).toBe(false)
  })
})

describe('breakAtGaps', () => {
  it('breaks the line where readings are more than 2× the median interval apart, never interpolating', () => {
    const gapped = breakAtGaps({ t: [0, 10, 20, 30, 100, 110], values: [1, 2, 3, 4, 5, 6] })
    expect(gapped.t).toEqual([0, 10, 20, 30, null, 100, 110])
    expect(gapped.values).toEqual([1, 2, 3, 4, null, 5, 6])
    expect(gapped.gaps).toEqual([[30, 100]])
  })

  it('keeps a regular series whole', () => {
    expect(breakAtGaps({ t: [0, 10, 20, 35], values: [1, 2, 3, 4] }).gaps).toEqual([])
  })
})

describe('ruleThresholds', () => {
  it('takes the distinct thresholds of this pallet’s anomalies of that kind', () => {
    const rows = [
      anomaly({ code: 'TH', threshold: 28 }),
      anomaly({ code: 'TH', threshold: 28, anomalyKey: 'K2' }),
      anomaly({ code: 'TL', threshold: 2 }),
      anomaly({ code: 'HH', threshold: 75 }),
      anomaly({ code: 'TH', threshold: null }),
      anomaly({ code: 'ZZ', threshold: 9 }),
    ]
    expect(ruleThresholds(rows, 'temperature')).toEqual([2, 28])
    expect(ruleThresholds(rows, 'humidity')).toEqual([75])
    expect(ruleThresholds(rows, 'mass')).toEqual([])
  })

  it('keeps only the anomalies of the period', () => {
    const rows = [anomaly({ eventDate: '2026-11-14 09:00:00' }), anomaly({ eventDate: '2026-10-01 09:00:00' })]
    const period = { from: new Date('2026-11-10T00:00:00Z'), to: new Date('2026-11-20T00:00:00Z') }
    expect(anomaliesInRange(rows, period)).toHaveLength(1)
  })
})

const measure = (key: string) => PALLET_MEASURES.find((m) => m.key === key)!

describe('yDomain / yLabels', () => {
  it('rounds the domain to nice numbers (1/2/5 × 10^n): 40–70 %HR, 8 700–9 300 kg', () => {
    expect(niceStep(4.8)).toBe(5)
    expect(niceStep(104)).toBe(100)
    expect(niceStep(160)).toBe(200)
    expect(niceStep(0.01)).toBe(0.1)
    const bare = { minSpan: () => 0, nonNegative: true }
    // Data whose padded extent is 43–67 and 8 739–9 261.
    expect(yDomain(bare, [43 + 24 * 0.08 / 1.16, 67 - 24 * 0.08 / 1.16])).toEqual([40, 70])
    expect(yDomain(bare, [8739 + 522 * 0.08 / 1.16, 9261 - 522 * 0.08 / 1.16])).toEqual([8700, 9300])
  })

  it('keeps a flat signal flat: the metric’s minimum span, centred on the data', () => {
    expect(yDomain(measure('ta'), [22, 22.4])).toEqual([16, 28])
    const [lo, hi] = yDomain(measure('hr'), [55, 55])
    expect(hi - lo).toBeGreaterThanOrEqual(20)
    expect(lo).toBeLessThan(55)
    expect(hi).toBeGreaterThan(55)
  })

  it('widens the weight to max(5 % of the value, 100 kg)', () => {
    const [lo, hi] = yDomain(measure('m'), [12000, 12230])
    expect(hi - lo).toBeGreaterThanOrEqual(0.05 * 12230)
    expect(lo % 100).toBe(0)
    const [low, high] = yDomain(measure('m'), [300, 300])
    expect(high - low).toBeGreaterThanOrEqual(100)
    expect(high - low).toBeLessThanOrEqual(160)
  })

  it('always includes the thresholds and anomaly readings', () => {
    const [lo, hi] = yDomain(measure('ta'), [20, 22], [31, 5])
    expect(lo).toBeLessThan(5)
    expect(hi).toBeGreaterThan(31)
  })

  it('never goes below 0 for a quantity that cannot', () => {
    expect(yDomain(measure('g'), [1, 1])[0]).toBe(0)
    expect(yDomain(measure('ta'), [-1, 1])[0]).toBeLessThan(-1)
  })

  it('labels the two ends fr-FR with thousands separators, without unit; 1 decimal only when needed', () => {
    expect(yLabels([8700, 9300])).toEqual(['9\u202f300', '8\u202f700'])
    expect(yLabels([0.2, 1.8])).toEqual(['1,8', '0,2'])
    expect(yLabels([0, 2])).toEqual(['2', '0'])
  })
})

describe('data extent', () => {
  it('runs from the first to the last instant', () => {
    expect(dataExtent([30, 10, 20])).toEqual({ first: 10, last: 30 })
    expect(dataExtent([])).toBeNull()
  })

  it('labels the dates in French, with the hour under 48 h', () => {
    const first = new Date(2026, 10, 14, 8).getTime()
    expect(extentLabels({ first, last: new Date(2026, 10, 18, 9).getTime() })).toEqual(['14 nov.', '18 nov.'])
    expect(extentLabels({ first, last: new Date(2026, 10, 15, 9).getTime() })).toEqual(['14 nov. 08:00', '15 nov. 09:00'])
  })

  it('notes the data span only when it covers less than half the period', () => {
    const period = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 31) }
    const extent = { first: new Date(2026, 10, 14, 8).getTime(), last: new Date(2026, 10, 18, 9).getTime() }
    expect(coverageNote(extent, period)).toBe('Données du 14 nov. au 18 nov.')
    expect(coverageNote({ first: period.from.getTime(), last: new Date(2026, 10, 20).getTime() }, period)).toBeNull()
    expect(coverageNote(null, period)).toBeNull()
  })
})
