import { describe, expect, it } from 'vitest'
import { massStatus, positionStatus, weightState } from './markerStyle'

describe('massStatus (FR8 — thresholds mapped to the four states)', () => {
  it.each([
    [0, 'alert'],
    [199, 'alert'],
    [200, 'warning'],
    [499, 'warning'],
    [500, 'ok'],
    [10000, 'ok'],
    [null, 'offline'],
    [NaN, 'offline'],
  ] as const)('maps mass %s to %s', (mass, expected) => {
    expect(massStatus(mass)).toBe(expected)
  })
})

describe('weightState (Pulse: % of the initial weight, mirror of the backend)', () => {
  it.each([
    [500, 1000, 50, 'ok'],
    [499, 1000, 49.9, 'warning'],
    [200, 1000, 20, 'warning'],
    [199, 1000, 19.9, 'alert'],
    [0, 1000, 0, 'alert'],
    [null, 1000, null, 'offline'],
    [300, null, null, 'offline'],
    [300, 0, null, 'offline'],
  ] as const)('%s kg of %s kg -> %s %%, %s', (mass, initial, pct, status) => {
    expect(weightState(mass, initial)).toEqual({ remainingPercent: pct, weightStatus: status })
  })
})

describe('positionStatus', () => {
  it('takes the backend weight state when given, else the kg thresholds', () => {
    expect(positionStatus({ mass: 900, weightStatus: 'alert' })).toBe('alert')
    expect(positionStatus({ mass: 900 })).toBe('ok')
  })
})
