import { describe, expect, it } from 'vitest'
import type { HistoryHook } from '../api/history'
import { formatLotHookRows } from './lotHooks'

function hook(overrides: Partial<HistoryHook>): HistoryHook {
  return {
    c: 'CHIP-1',
    lot: 42,
    cust: 'CUST-LOT-1',
    from: Date.UTC(2026, 0, 1, 0, 0, 0),
    to: Date.UTC(2026, 0, 2, 0, 0, 0),
    net: 100,
    gros: 110,
    nb: 5,
    per: '2026-12-31',
    ...overrides,
  }
}

describe('formatLotHookRows (KAN-175 FR21, CB14)', () => {
  it('formats every field for a fully-populated hook', () => {
    const [row] = formatLotHookRows([hook({})])
    expect(row.chipId).toBe('CHIP-1')
    expect(row.cpalLot).toBe('42')
    expect(row.clientLot).toBe('CUST-LOT-1')
    expect(row.from).toContain('2026-01-01')
    expect(row.to).toContain('2026-01-02')
    expect(row.netWeight).toBe('100.00 kg')
    expect(row.grossWeight).toBe('110.00 kg')
    expect(row.quantity).toBe('5')
    expect(row.expiry).toBe('2026-12-31')
  })

  it('degrades missing optional fields to a dash rather than throwing', () => {
    const [row] = formatLotHookRows([hook({ cust: null, net: null, gros: null, nb: null, per: null })])
    expect(row.clientLot).toBe('—')
    expect(row.netWeight).toBe('—')
    expect(row.grossWeight).toBe('—')
    expect(row.quantity).toBe('—')
    expect(row.expiry).toBe('—')
  })

  it('returns an empty array for an empty hooks list (CB15 — missing/unmigrated DDLOT tables)', () => {
    expect(formatLotHookRows([])).toEqual([])
  })
})
