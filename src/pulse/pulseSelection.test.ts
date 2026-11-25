import { describe, expect, it } from 'vitest'
import { parseView, stepTo, viewKey, withView } from './pulseSelection'

const params = (search: string) => new URLSearchParams(search)

describe('Pulse selection in the URL (unified shell §1.3)', () => {
  it('parses each level', () => {
    expect(parseView(params(''))).toEqual({ kind: 'contract' })
    expect(parseView(params('palette=CHIP-A'))).toEqual({ kind: 'pallet', chipId: 'CHIP-A' })
    expect(parseView(params('palette=CHIP-A&vue=anomalies'))).toEqual({ kind: 'contract', chipId: 'CHIP-A' })
    expect(parseView(params('anomalie=K1&palette=CHIP-A'))).toEqual({ kind: 'anomaly', anomalyKey: 'K1', from: { kind: 'pallet', chipId: 'CHIP-A' } })
    // `vue` without a pallet means nothing.
    expect(parseView(params('vue=anomalies'))).toEqual({ kind: 'contract' })
  })

  it('round-trips every level, keeping the other params (period, instant)', () => {
    const views = [
      { kind: 'contract' as const },
      { kind: 'pallet' as const, chipId: 'CHIP-A' },
      { kind: 'contract' as const, chipId: 'CHIP-A' },
      { kind: 'anomaly' as const, anomalyKey: 'K1', from: { kind: 'contract' as const, chipId: 'CHIP-A' } },
      { kind: 'anomaly' as const, anomalyKey: 'K2', from: { kind: 'contract' as const } },
    ]
    for (const view of views) {
      const next = withView(params('periode=7j&t=123&palette=OLD&anomalie=OLD'), view)
      expect(parseView(next)).toEqual(view)
      expect(next.get('periode')).toBe('7j')
      expect(next.get('t')).toBe('123')
    }
  })

  it('keys a level by its selection only', () => {
    expect(viewKey({ kind: 'contract' })).toBe('c')
    expect(viewKey({ kind: 'pallet', chipId: 'A' })).toBe('p:A')
    expect(viewKey({ kind: 'anomaly', anomalyKey: 'K', from: { kind: 'contract', chipId: 'A' } })).toBe('c:A|a:K')
  })

  it('goes back when the target is below in Pulse’s own history, else pushes', () => {
    expect(stepTo(['c', 'p:A'], 'p:A|a:K', 'p:A|a:K')).toBe(0)
    expect(stepTo(['c', 'p:A'], 'p:A|a:K', 'p:A')).toBe(-1)
    expect(stepTo(['c', 'p:A'], 'p:A|a:K', 'c')).toBe(-2)
    expect(stepTo([], 'p:A', 'c')).toBe('push')
    expect(stepTo(['c'], 'p:A', 'p:B')).toBe('push')
  })
})
