import { describe, expect, it } from 'vitest'
import { clampZ, daysToExpiry, formatExpiry } from './trendsData'

describe('trendsData (KAN-256)', () => {
  it('clamps the displayed z to ±5', () => {
    expect(clampZ(6.8)).toBe(5)
    expect(clampZ(-12)).toBe(-5)
    expect(clampZ(1.15)).toBe(1.15)
  })

  it('counts whole days to expiry, negative once expired', () => {
    const today = new Date(2026, 10, 19, 15, 30)
    expect(daysToExpiry('2026-11-20', today)).toBe(1)
    expect(daysToExpiry('2026-11-19', today)).toBe(0)
    expect(daysToExpiry('2026-11-18', today)).toBe(-1)
  })

  it('formats the expiry as dd/MM/yyyy', () => {
    expect(formatExpiry('2027-10-01')).toBe('01/10/2027')
  })
})
