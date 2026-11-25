import { describe, expect, it } from 'vitest'
import type { Position } from '../api/positions'
import { formatPlace, formatPositionCard } from './positionTooltip'

const basePosition: Position = {
  contractId: 12,
  chipId: 'CHIP-001',
  timestamp: '2026-11-15T11:00:00Z',
  latitude: 49.5,
  longitude: 3,
  ambientTemperature: 22,
  humidity: 55,
  mass: 9000,
  mpuTemperature: 21.5,
  accelG: 1,
}

const NOW = new Date('2026-11-24T12:00:00Z')

describe('formatPositionCard (KAN-160 FR7, Pulse layout v2 §4)', () => {
  it('titles the card with the chip ID; local time with the relative age, never UTC', () => {
    const card = formatPositionCard(basePosition, NOW)
    expect(card.title).toBe('CHIP-001')
    expect(card.when).toMatch(/^15\snov\.\s\d{2}:00 · il\sy\sa\s9\sj$/)
    expect(card.when).not.toMatch(/UTC|2026-/)
  })

  it('shows the position with 4 decimals in fr-FR', () => {
    expect(formatPositionCard(basePosition, NOW).place).toBe('49,5000, 3,0000')
    expect(formatPlace(48.85661, 2.35222)).toBe('48,8566, 2,3522')
  })

  it('lays the four readings out as fr-FR measures, without the MPU temperature', () => {
    const { metrics } = formatPositionCard(basePosition, NOW)
    expect(metrics.map((m) => m.key)).toEqual(['temperature', 'humidity', 'acceleration', 'weight'])
    expect(metrics.map((m) => m.value.replace(/\s/g, ' '))).toEqual(['22 °C', '55 %HR', '1 g', '9 000 kg'])
    expect(JSON.stringify(metrics)).not.toMatch(/MPU|21,5/)
  })

  it('leaves out every line without data', () => {
    const card = formatPositionCard(
      { ...basePosition, timestamp: null, latitude: null, longitude: null, ambientTemperature: null, humidity: null, mass: null, accelG: null },
      NOW,
    )
    expect(card).toEqual({ title: 'CHIP-001', when: null, place: null, metrics: [] })
    expect(formatPositionCard({ ...basePosition, timestamp: 'not-a-date' }, NOW).when).toBeNull()
  })
})
