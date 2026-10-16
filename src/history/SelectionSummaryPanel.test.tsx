import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { HistoryRow } from '../api/history'
import { SelectionSummaryPanel } from './SelectionSummaryPanel'

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return {
    c: 'CHIP-1',
    t: 0,
    ts: '2026-01-01T00:00:00',
    p: 0,
    la: null,
    lo: null,
    ta: null,
    hr: null,
    m: null,
    g: null,
    tm: null,
    ...overrides,
  }
}

describe('SelectionSummaryPanel (KAN-175 FR24)', () => {
  it('shows measurement count, device count and the temp range', () => {
    const rows = [row({ c: 'A', ta: 10 }), row({ c: 'B', ta: 20 })]
    render(<SelectionSummaryPanel rows={rows} />)
    expect(screen.getByTestId('selection-summary-count')).toHaveTextContent('2 mesure(s)')
    expect(screen.getByTestId('selection-summary-device-count')).toHaveTextContent('2 appareil(s)')
    expect(screen.getByTestId('selection-summary-temp-range')).toHaveTextContent('10.0°C – 20.0°C')
  })

  it('shows a no-temperature message instead of a range when no selected row has ambient temp', () => {
    const rows = [row({ ta: null })]
    render(<SelectionSummaryPanel rows={rows} />)
    expect(screen.getByTestId('selection-summary-no-temp')).toBeInTheDocument()
    expect(screen.queryByTestId('selection-summary-temp-range')).not.toBeInTheDocument()
  })

  it('recomputes over only the currently visible devices', () => {
    const rows = [row({ c: 'A', ta: 10 }), row({ c: 'B', ta: 999 })]
    render(<SelectionSummaryPanel rows={rows} visibleDeviceIds={['A']} />)
    expect(screen.getByTestId('selection-summary-count')).toHaveTextContent('1 mesure(s)')
    expect(screen.getByTestId('selection-summary-temp-range')).toHaveTextContent('10.0°C – 10.0°C')
  })
})
