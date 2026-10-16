import { describe, expect, it } from 'vitest'
import { deviceBorderColor, massFillColor } from './markerStyle'

describe('massFillColor (KAN-160 FR5)', () => {
  it.each([
    [0, '#dc2626'],
    [199, '#dc2626'],
    [200, '#f59e0b'],
    [499, '#f59e0b'],
    [500, '#16a34a'],
    [10000, '#16a34a'],
  ])('maps mass %i to %s', (mass, expected) => {
    expect(massFillColor(mass)).toBe(expected)
  })

  it('maps null to grey', () => {
    expect(massFillColor(null)).toBe('#9aa1a9')
  })

  it('maps NaN to grey rather than any threshold bucket', () => {
    expect(massFillColor(NaN)).toBe('#9aa1a9')
  })
})

describe('deviceBorderColor (KAN-160 FR6)', () => {
  it('is stable across repeated calls for the same chip id', () => {
    const first = deviceBorderColor('CHIP-001')
    const second = deviceBorderColor('CHIP-001')
    expect(first).toBe(second)
  })

  it('can differ between different chip ids', () => {
    const colors = new Set([
      deviceBorderColor('CHIP-001'),
      deviceBorderColor('CHIP-002'),
      deviceBorderColor('CHIP-003'),
      deviceBorderColor('CHIP-004'),
    ])
    expect(colors.size).toBeGreaterThan(1)
  })
})
