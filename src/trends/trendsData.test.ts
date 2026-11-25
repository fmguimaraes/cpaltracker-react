import { describe, expect, it } from 'vitest'
import type { TrendsLot } from '../api/trends'
import {
  clipOf,
  formatExpiry,
  formatNumber,
  formatRatio,
  formatZ,
  sortLots,
  xMax,
  yDomain,
} from './trendsData'

const lot = (custLotNumber: string, risk: TrendsLot['risk'], z: number, placed = true): TrendsLot => ({
  cpalLot: `CPL-${custLotNumber}`, custLotNumber, productName: null, balanceKg: 1000, referenceVelocity: placed ? 100 : 0,
  requiredVelocity: 150, velocityRatio: placed ? 1.5 : null, z, risk, placed, expiryDate: '2027-01-01', daysToExpiry: 37,
})

describe('trendsData (KAN-256)', () => {
  it('formats the expiry as dd/MM/yyyy', () => {
    expect(formatExpiry('2027-10-01')).toBe('01/10/2027')
  })

  it('formats numbers fr-FR (comma decimals, narrow-space thousands)', () => {
    expect(formatNumber(8600)).toBe('8 600')
    expect(formatNumber(196.5)).toBe('196,5')
    expect(formatZ(27.6)).toBe('+27,60')
    expect(formatZ(-3.1)).toMatch(/^[-−]3,10$/)
    expect(formatRatio(196.5 / 130)).toBe('×1,5')
  })

  it('keeps +3 on top and follows the data down to −5; values outside are clipped on the edge', () => {
    expect(yDomain([0.4, 1.2])).toEqual([-2, 3])
    expect(yDomain([-3.1, 6.8])).toEqual([-4, 3])
    expect(yDomain([-12])).toEqual([-5, 3])
    expect(clipOf(6.8, [-4, 3])).toBe('above')
    expect(clipOf(-12, [-5, 3])).toBe('below')
    expect(clipOf(2, [-4, 3])).toBeNull()
  })

  it('rounds the x axis up to the next 30 days', () => {
    expect(xMax([18, 224])).toBe(240)
    expect(xMax([240])).toBe(240)
    expect(xMax([5])).toBe(30)
  })

  it('sorts by z desc by default, insufficient history last', () => {
    const lots = [lot('a', 'faible', -1), lot('x', 'eleve', 9, false), lot('b', 'eleve', 2)]
    expect(sortLots(lots, { key: 'z', desc: true }).map((l) => l.custLotNumber)).toEqual(['b', 'a', 'x'])
    expect(sortLots(lots, { key: 'z', desc: false }).map((l) => l.custLotNumber)).toEqual(['a', 'b', 'x'])
    expect(sortLots(lots, { key: 'lot', desc: false }).map((l) => l.custLotNumber)).toEqual(['a', 'b', 'x'])
    expect(sortLots(lots, { key: 'velocity', desc: true }).map((l) => l.custLotNumber)).toEqual(['a', 'b', 'x'])
  })
})
