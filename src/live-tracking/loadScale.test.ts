import { describe, expect, it } from 'vitest'
import { loadLevel, maxMass } from './loadScale'

describe('loadScale (Pulse weight ramp)', () => {
  it('takes the heaviest known weight as "charge pleine"', () => {
    expect(maxMass([{ mass: 120 }, { mass: null }, { mass: 480 }])).toBe(480)
    expect(maxMass([{ mass: null }, { mass: 0 }])).toBeNull()
  })

  it('buckets a weight into 5 levels from empty to full load', () => {
    expect(loadLevel(0, 500)).toBe(1)
    expect(loadLevel(50, 500)).toBe(1)
    expect(loadLevel(101, 500)).toBe(2)
    expect(loadLevel(250, 500)).toBe(3)
    expect(loadLevel(499, 500)).toBe(5)
    expect(loadLevel(500, 500)).toBe(5)
    expect(loadLevel(900, 500)).toBe(5)
  })

  it('has no level without a weight or a reference', () => {
    expect(loadLevel(null, 500)).toBeNull()
    expect(loadLevel(200, null)).toBeNull()
  })
})
