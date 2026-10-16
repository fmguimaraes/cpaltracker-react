import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HistoryHook } from '../api/history'
import { LotHookHistory } from './LotHookHistory'

function hook(overrides: Partial<HistoryHook>): HistoryHook {
  return {
    c: 'CHIP-1',
    lot: 1,
    cust: 'CUST-1',
    from: 0,
    to: 1000,
    net: 10,
    gros: 12,
    nb: 3,
    per: '2026-12-31',
    ...overrides,
  }
}

describe('LotHookHistory (KAN-175 FR21)', () => {
  it('shows an empty-state message, not an error, when there are no hooks (CB15)', () => {
    render(<LotHookHistory hooks={[]} />)
    expect(screen.getByTestId('lot-hook-history-empty')).toBeInTheDocument()
  })

  it('renders one row per hook', () => {
    render(<LotHookHistory hooks={[hook({ c: 'CHIP-A' }), hook({ c: 'CHIP-B' })]} />)
    const table = screen.getByTestId('lot-hook-history')
    expect(table).toBeInTheDocument()
    expect(screen.getByTestId('lot-hook-row-0')).toHaveTextContent('CHIP-A')
    expect(screen.getByTestId('lot-hook-row-1')).toHaveTextContent('CHIP-B')
  })
})
