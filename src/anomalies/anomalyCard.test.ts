import { describe, expect, it } from 'vitest'
import type { AnomalyRow } from '../api/anomalies'
import {
  anomalyCardContent,
  cardHeadline,
  degreesToKm,
  formatCoordinates,
  formatAbsolute,
  formatMeasure,
  formatRelative,
  isClosed,
  parseUtc,
  sortAnomalies,
} from './anomalyCard'

const NBSP = '\u00a0'
/** Intl may use (narrow) non-breaking spaces inside relative/absolute times. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

function row(overrides: Partial<AnomalyRow> = {}): AnomalyRow {
  return {
    anomalyKey: '1-3',
    status: 'detectee',
    code: 'TH',
    label: 'Température >= 28.00000 °C',
    threshold: 28,
    value: 31,
    excess: 3,
    unit: '°C',
    eventDate: '2026-11-14 08:00:00',
    detectedAt: '2026-11-20 09:06:00.666',
    chipId: 'DEMO-CHIP-001',
    lot: null,
    ...overrides,
  }
}

describe('anomalyCard (owner redesign 2026-11-25)', () => {
  it('formats French numbers, strips trailing zeros, max 1 decimal, non-breaking space before the unit', () => {
    expect(formatMeasure(28.00000, '°C')).toBe(`28${NBSP}°C`)
    expect(formatMeasure(6.2, 'g')).toBe(`6,2${NBSP}g`)
    expect(formatMeasure(19.54, '°C')).toBe(`19,5${NBSP}°C`)
    expect(formatMeasure(1.2000000000000002, 'g', true)).toBe(`+1,2${NBSP}g`)
    // km: integers from 10, one decimal below.
    expect(formatMeasure(72.49, 'km')).toBe(`72${NBSP}km`)
    expect(formatMeasure(5.566, 'km')).toBe(`5,6${NBSP}km`)
  })

  it('builds a temperature card: label + value + signed excess, chip · threshold, no rule code', () => {
    const card = anomalyCardContent(row())
    expect(card.title).toBe('Température')
    expect(card.measure).toBe(`31${NBSP}°C`)
    expect(card.excess).toBe(`+3${NBSP}°C`)
    expect(card.details).toEqual(['DEMO-CHIP-001', `seuil 28${NBSP}°C`])
    expect(card.ruleTooltip).toBe('TH · Température >= 28.00000 °C')
    expect([card.title, card.measure, card.excess, ...card.details].join(' ')).not.toMatch(/\bTH\b/)
  })

  describe('excess = measured − threshold, signed with a true minus (U+2212)', () => {
    const MINUS = '−'
    it.each([
      ['>=', 'TH', 28, 31, 3, `+3${NBSP}°C`],
      ['>=', 'TH', 28.5, 31.2, 2.7, `+2,7${NBSP}°C`],
      ['>', 'HH', 80, 85, 5, `+5${NBSP}%HR`],
      ['>', 'HH', 80.5, 82.75, 2.25, `+2,3${NBSP}%HR`],
      ['<=', 'TL', 5, 2, -3, `${MINUS}3${NBSP}°C`],
      ['<=', 'TL', 5.5, 2.25, -3.25, `${MINUS}3,3${NBSP}°C`],
      ['<', 'PL', 300, 280, -20, `${MINUS}20${NBSP}kg`],
      ['<', 'HL', 30.5, 28.2, -2.3, `${MINUS}2,3${NBSP}%HR`],
    ])('a "%s" rule (%s, seuil %d, mesuré %d)', (operator, code, threshold, value, excess, expected) => {
      const card = anomalyCardContent(row({ code, label: `Règle ${operator} ${threshold}`, threshold, value, excess }))
      expect(card.excess).toBe(expected)
      expect(card.excess).not.toContain('-')
    })

    it('"Température 2 °C · seuil 5 °C" displays "−3 °C"', () => {
      const card = anomalyCardContent(
        row({ code: 'TL', label: 'Température <= 5.00000 °C', threshold: 5, value: 2, excess: -3 }),
      )
      expect(card.measure).toBe(`2${NBSP}°C`)
      expect(card.details).toContain(`seuil 5${NBSP}°C`)
      expect(card.excess).toBe(`${MINUS}3${NBSP}°C`)
    })

    it('a negative reading also uses the true minus, and a near-zero excess never shows "−0"', () => {
      expect(formatMeasure(-4.5, '°C')).toBe(`${MINUS}4,5${NBSP}°C`)
      expect(formatMeasure(-0.04, '°C', true)).toBe(`0${NBSP}°C`)
      expect(formatMeasure(-0.04, '°C')).toBe(`0${NBSP}°C`)
    })
  })

  it('drops every segment whose field is missing, with no placeholder', () => {
    const card = anomalyCardContent(row({ value: null, threshold: null, excess: null, chipId: '', eventDate: '' }))
    expect(card.measure).toBeNull()
    expect(card.excess).toBeNull()
    expect(card.details).toEqual([])
    expect(card.time).toBeNull()
    expect(JSON.stringify(card)).not.toMatch(/—|N\/A|inconnu/)
  })

  it('names the lot when there is one, and never repeats the chip ID inside a pallet panel', () => {
    const lot = { cpalLot: 'CP-1', custLotNumber: 'LOT-2410-C', productName: null }
    expect(anomalyCardContent(row({ lot })).details[0]).toBe('LOT-2410-C')
    expect(anomalyCardContent(row(), { showName: false }).details).toEqual([`seuil 28${NBSP}°C`])
  })

  it('shows a geofence as "Hors zone · ≈ N km du centre" and a radius, never coordinates or degrees', () => {
    const card = anomalyCardContent(
      row({
        code: 'LF',
        label: 'Hors zone (> 0.05000° de 48.853400, 2.348800)',
        threshold: 0.05,
        value: 0.6512,
        excess: null,
        unit: '°',
        chipId: 'DEMO-CHIP-002',
      }),
    )
    expect(card.title).toBe('Hors zone')
    expect(card.measure).toBe(`≈${NBSP}72${NBSP}km du centre`)
    expect(card.excess).toBeNull()
    expect(card.details).toEqual(['DEMO-CHIP-002', `rayon 5,6${NBSP}km`])
    const visible = [card.title, card.measure, ...card.details].join(' ')
    expect(visible).not.toMatch(/°|48\.85|2\.34/)
    // The raw rule (with its reference point) stays reachable in the icon tooltip only.
    expect(card.ruleTooltip).toContain('48.853400')
    expect(degreesToKm(1)).toBeCloseTo(111.32)
  })

  it('a geofence without its values keeps just "Hors zone" and the name', () => {
    const card = anomalyCardContent(row({ code: 'LF', label: 'Hors zone', threshold: null, value: null, excess: null }))
    expect(card.measure).toBeNull()
    expect(card.details).toEqual(['DEMO-CHIP-001'])
  })

  it('an unknown code keeps the raw rule label and a value, without an excess', () => {
    const card = anomalyCardContent(
      row({ code: 'XX', label: 'Règle spéciale', unit: '', threshold: 3, value: 4, excess: null }),
    )
    expect(card.rule).toBeNull()
    expect(card.title).toBe('Règle spéciale')
    expect(card.measure).toBe('4')
    expect(card.excess).toBeNull()
  })

  it('reads the UTC wall-clock text and formats local relative + absolute times', () => {
    const date = parseUtc('2026-11-14 08:00:00')!
    expect(date.toISOString()).toBe('2026-11-14T08:00:00.000Z')
    expect(parseUtc('2026-11-19 15:34:02.120')?.toISOString()).toBe('2026-11-19T15:34:02.120Z')
    expect(parseUtc('')).toBeNull()

    const now = new Date(date.getTime() + 11 * 86_400_000 + 3_600_000)
    expect(plain(formatRelative(date, now))).toBe('il y a 11 j')
    expect(plain(formatRelative(date, new Date(date.getTime() + 2 * 3_600_000)))).toBe('il y a 2 h')
    expect(plain(formatRelative(date, new Date(date.getTime() + 10_000)))).toBe('à l’instant')

    const local = new Date(2026, 10, 14, 9, 0)
    expect(plain(formatAbsolute(local, new Date(2026, 10, 25)))).toBe('14 nov. 09:00')
    expect(plain(formatAbsolute(local, new Date(2027, 0, 2)))).toBe('14 nov. 2026 09:00')
  })

  it('sorts new > in progress > closed (fermee and cloturee alike), then most recent first', () => {
    const rows = [
      row({ anomalyKey: 'closed-final', status: 'cloturee', eventDate: '2026-11-20 00:00:00' }),
      row({ anomalyKey: 'progress', status: 'en_cours', eventDate: '2026-11-10 00:00:00' }),
      row({ anomalyKey: 'new-old', status: 'detectee', eventDate: '2026-11-01 00:00:00' }),
      row({ anomalyKey: 'closed-review', status: 'fermee', eventDate: '2026-11-21 00:00:00' }),
      row({ anomalyKey: 'new-recent', status: 'detectee', eventDate: '2026-11-15 00:00:00' }),
    ]
    expect(sortAnomalies(rows).map((r) => r.anomalyKey)).toEqual([
      'new-recent',
      'new-old',
      'progress',
      'closed-review',
      'closed-final',
    ])
    expect(isClosed('fermee')).toBe(true)
    expect(isClosed('cloturee')).toBe(true)
    expect(isClosed('en_cours')).toBe(false)
  })

  it('builds the shared headline (card and detail header) and French coordinates', () => {
    expect(plain(cardHeadline(anomalyCardContent(row())))).toBe('Température 31 °C')
    const geofence = anomalyCardContent(row({ code: 'LF', value: 0.05, threshold: 0.02, excess: null, unit: '°' }))
    expect(plain(cardHeadline(geofence))).toBe('Hors zone · ≈ 5,6 km du centre')
    expect(formatCoordinates({ lat: 48.853412, lng: -2.34881 })).toBe('48,8534, −2,3488')
  })
})
