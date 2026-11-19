import { describe, expect, it } from 'vitest'
import { formatCoordinates, formatMoment, formatValue, statusesForFilter } from './anomalyFormat'

describe('anomalyFormat (KAN-261)', () => {
  it('leaves the server default for "non clôturées", requests the four statuses for "toutes"', () => {
    expect(statusesForFilter('open')).toBeUndefined()
    expect(statusesForFilter('all')).toEqual(['detectee', 'en_cours', 'fermee', 'cloturee'])
    expect(statusesForFilter('fermee')).toEqual(['fermee'])
  })

  it('formats a value with its unit, as stored', () => {
    expect(formatValue(19.5, '°C')).toBe('19,5 °C')
    expect(formatValue(0.73, '°')).toBe('0,73°')
    expect(formatValue(null, '°C')).toBe('—')
    expect(formatValue(3, '')).toBe('3')
  })

  it('formats a moment and coordinates as text', () => {
    expect(formatMoment('2026-11-05 21:57:00')).toBe('2026-11-05 21:57 UTC')
    expect(formatCoordinates({ lat: 46.2, lng: 5.3 })).toBe('46.2, 5.3')
  })
})
