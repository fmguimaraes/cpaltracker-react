import { describe, expect, it } from 'vitest'
import type { HistoryHook, HistoryRow } from '../api/history'
import { formatTimelineTooltip } from './timelineTooltip'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    c: 'CHIP-1',
    t: Date.UTC(2026, 0, 5, 8, 9, 3),
    ts: '2026-01-05T08:09:03',
    p: 1,
    la: 43.493812,
    lo: 5.353912,
    ta: 20.1,
    hr: 55.4,
    m: 312.5,
    g: 1.023,
    tm: 22.9,
    ...overrides,
  }
}

describe('formatTimelineTooltip (FR13/CB22)', () => {
  it('orders and formats every measurement field, with no active lot', () => {
    const fields = formatTimelineTooltip(row({}), [])
    expect(fields.map((f) => f.label)).toEqual([
      'Date de mesure',
      'Position',
      'Température amb.',
      'Humidité',
      'Masse',
      'Accélération',
      'Température MPU',
    ])
    expect(fields[0].value).toBe('2026-01-05 08:09:03 UTC')
    expect(fields[1].value).toBe('43.493812, 5.353912')
    expect(fields[2].value).toBe('20.10 °C')
    expect(fields[3].value).toBe('55.4 %')
    expect(fields[4].value).toBe('312.50 kg')
    expect(fields[5].value).toBe('1.023 G')
    expect(fields[6].value).toBe('22.90 °C')
  })

  it('shows dashes for null numeric fields and "non mesuré" for a null mass', () => {
    const fields = formatTimelineTooltip(
      row({ ta: null, hr: null, m: null, g: null, tm: null }),
      [],
    )
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f.value]))
    expect(byLabel['Température amb.']).toBe('—')
    expect(byLabel.Masse).toBe('non mesuré')
  })

  it('appends lot fields only when a hook is active at that instant (half-open interval)', () => {
    const hooks: HistoryHook[] = [
      {
        c: 'CHIP-1',
        lot: 42,
        cust: 'CUST-7',
        from: Date.UTC(2026, 0, 5, 0, 0, 0),
        to: Date.UTC(2026, 0, 6, 0, 0, 0),
        net: 100,
        gros: 110,
        nb: 3,
        per: '2026-12-31',
      },
    ]
    const active = formatTimelineTooltip(row({}), hooks)
    const byLabel = Object.fromEntries(active.map((f) => [f.label, f.value]))
    expect(byLabel['Lot client']).toBe('CUST-7')
    expect(byLabel['Lot cPAL']).toBe('42')
    expect(byLabel['Péremption']).toBe('2026-12-31')
    expect(byLabel['Quantité']).toBe('3')

    const outOfRange = formatTimelineTooltip(row({ t: Date.UTC(2026, 0, 7) }), hooks)
    expect(outOfRange.some((f) => f.label === 'Lot client')).toBe(false)
  })

  it('omits expiry/quantity lot fields when absent, without affecting the others', () => {
    const hooks: HistoryHook[] = [
      {
        c: 'CHIP-1',
        lot: 42,
        cust: 'CUST-7',
        from: Date.UTC(2026, 0, 5, 0, 0, 0),
        to: Date.UTC(2026, 0, 6, 0, 0, 0),
        net: null,
        gros: null,
        nb: null,
        per: null,
      },
    ]
    const fields = formatTimelineTooltip(row({}), hooks)
    expect(fields.some((f) => f.label === 'Péremption')).toBe(false)
    expect(fields.some((f) => f.label === 'Quantité')).toBe(false)
    expect(fields.some((f) => f.label === 'Lot cPAL')).toBe(true)
  })
})
