import { describe, expect, it } from 'vitest'
import type { Position } from '../api/positions'
import { formatPositionTooltip } from './positionTooltip'

const basePosition: Position = {
  contractId: 12,
  chipId: 'CHIP-001',
  timestamp: '2026-10-10T08:00:05Z',
  latitude: 48.8566,
  longitude: 2.3522,
  ambientTemperature: 19.1,
  humidity: 55,
  mass: 420,
  mpuTemperature: 21.5,
  accelG: 1.02,
}

describe('formatPositionTooltip (KAN-160 FR7)', () => {
  it('formats the date explicitly as UTC', () => {
    const fields = formatPositionTooltip(basePosition)
    expect(fields.find((f) => f.label === 'Date')?.value).toBe('10/10/2026 08:00 UTC')
  })

  it('formats position as "latitude, longitude"', () => {
    const fields = formatPositionTooltip(basePosition)
    expect(fields.find((f) => f.label === 'Position')?.value).toBe('48.8566, 2.3522')
  })

  it('renders every numeric field with its unit', () => {
    const fields = formatPositionTooltip(basePosition)
    expect(fields.find((f) => f.label === 'Température ambiante')?.value).toBe('19.1 °C')
    expect(fields.find((f) => f.label === 'Humidité')?.value).toBe('55 %')
    expect(fields.find((f) => f.label === 'Masse')?.value).toBe('420 kg')
    expect(fields.find((f) => f.label === 'Accélération')?.value).toBe('1.02 g')
    expect(fields.find((f) => f.label === 'Température MPU')?.value).toBe('21.5 °C')
  })

  it('renders every field as a non-empty, never-null string, even when every value is null', () => {
    const empty: Position = {
      contractId: 12,
      chipId: 'CHIP-002',
      timestamp: null,
      latitude: null,
      longitude: null,
      ambientTemperature: null,
      humidity: null,
      mass: null,
      mpuTemperature: null,
      accelG: null,
    }
    const fields = formatPositionTooltip(empty)
    expect(fields).toHaveLength(7)
    for (const field of fields) {
      expect(typeof field.value).toBe('string')
      expect(field.value.length).toBeGreaterThan(0)
    }
  })

  it('never produces an unparseable-date crash, falling back to a placeholder', () => {
    const fields = formatPositionTooltip({ ...basePosition, timestamp: 'not-a-date' })
    expect(fields.find((f) => f.label === 'Date')?.value).toBe('Inconnu(e)')
  })
})
