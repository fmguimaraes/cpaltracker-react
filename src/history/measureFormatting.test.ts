import { describe, expect, it } from 'vitest'
import type { MeasureExcursions } from '../api/history'
import {
  buildSparklinePaths,
  formatChange24hLabel,
  formatExcursionsBadge,
  formatMeasureCount,
  formatMeasureValue,
  formatMinMaxFooter,
  formatSignedMeasureValue,
  trendDirection,
} from './measureFormatting'

describe('formatMeasureValue (FR15)', () => {
  it('renders null as an em dash', () => {
    expect(formatMeasureValue(null, 1)).toBe('—')
  })

  it('formats with fr-FR locale and the given decimals', () => {
    expect(formatMeasureValue(3.456, 1)).toBe('3,5')
    expect(formatMeasureValue(1000, 0)).toBe('1 000')
  })
})

describe('formatSignedMeasureValue', () => {
  it('prefixes a minus sign (U+2212) for negative values', () => {
    expect(formatSignedMeasureValue(-3.2, 1)).toBe('−3,2')
  })

  it('prefixes a plus sign for non-negative values', () => {
    expect(formatSignedMeasureValue(0, 1)).toBe('+0,0')
    expect(formatSignedMeasureValue(3.2, 1)).toBe('+3,2')
  })

  it('renders null as an em dash', () => {
    expect(formatSignedMeasureValue(null, 1)).toBe('—')
  })
})

describe('formatChange24hLabel (FR11.3)', () => {
  it('shows an em dash when change24h is null', () => {
    expect(formatChange24hLabel(null, 1, '°C')).toBe('Δ 24 h —')
  })

  it('shows the signed value with unit', () => {
    expect(formatChange24hLabel(-3.2, 1, '°C')).toBe('Δ 24 h −3,2 °C')
  })
})

describe('formatMinMaxFooter (FR11.5)', () => {
  it('formats min and max with the unit once', () => {
    expect(formatMinMaxFooter(2, 8.4, 1, '°C')).toBe('min 2,0 · max 8,4 °C')
  })
})

describe('formatExcursionsBadge (FR11.5)', () => {
  it('formats the count/total hors range badge text', () => {
    const excursions: MeasureExcursions = { count: 3, total: 120, low: 2, high: 8, lastAt: null }
    expect(formatExcursionsBadge(excursions, 0, '°C')).toBe('3/120 hors 2–8 °C')
  })
})

describe('formatMeasureCount', () => {
  it('groups thousands with fr-FR locale', () => {
    expect(formatMeasureCount(1234)).toBe('1 234')
  })
})

describe('trendDirection', () => {
  it('maps rising/falling/stable/null to up/down/flat', () => {
    expect(trendDirection('rising')).toBe('up')
    expect(trendDirection('falling')).toBe('down')
    expect(trendDirection('stable')).toBe('flat')
    expect(trendDirection(null)).toBe('flat')
  })
})

describe('buildSparklinePaths (FR11.4)', () => {
  it('returns null for an empty series', () => {
    expect(buildSparklinePaths([], 100, 20)).toBeNull()
  })

  it('builds a flat line for a single point', () => {
    const paths = buildSparklinePaths([['2026-01-01T00:00:00Z', 5]], 100, 20)
    expect(paths?.line).toContain('M50.00,10.00')
  })

  it('scales to the series own min/max, not a fixed range', () => {
    const points: Array<[string, number]> = [
      ['2026-01-01T00:00:00Z', 0],
      ['2026-01-01T00:01:00Z', 10],
    ]
    const paths = buildSparklinePaths(points, 100, 20)
    // First point sits at the min (y = height, bottom); last at the max (y = 0, top).
    expect(paths?.line).toBe('M0.00,20.00 L100.00,0.00')
    expect(paths?.area).toBe('M0.00,20.00 L100.00,0.00 L100.00,20.00 L0.00,20.00 Z')
  })

  it('does not divide by zero when every value is equal', () => {
    const points: Array<[string, number]> = [
      ['2026-01-01T00:00:00Z', 5],
      ['2026-01-01T00:01:00Z', 5],
    ]
    const paths = buildSparklinePaths(points, 100, 20)
    expect(paths?.line).toBe('M0.00,10.00 L100.00,10.00')
  })
})
