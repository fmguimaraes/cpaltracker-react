import { describe, expect, it } from 'vitest'
import { massStatus } from './markerStyle'

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
