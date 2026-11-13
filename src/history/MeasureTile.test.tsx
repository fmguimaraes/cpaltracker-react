import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MeasureSummary } from '../api/history'
import { MeasureTile } from './MeasureTile'

function summary(overrides: Partial<MeasureSummary> = {}): MeasureSummary {
  return {
    label: 'Température ambiante',
    unit: '°C',
    decimals: 1,
    stableBand: 0.5,
    last: 5.2,
    lastAt: '2026-01-01T00:00:00Z',
    min: 2,
    max: 8.4,
    minAt: null,
    maxAt: null,
    mean: 5,
    count: 60,
    periodChange: 1.1,
    change24h: -3.2,
    change24hRef: null,
    trend: 'falling',
    excursions: null,
    sparkline: [
      ['2026-01-01T00:00:00Z', 5],
      ['2026-01-01T00:01:00Z', 6],
    ],
    ...overrides,
  }
}

describe('MeasureTile (KAN-232 FR11, FR16)', () => {
  it('renders the latest value, 24h change and sparkline from the summary', () => {
    render(<MeasureTile measure="ta" summary={summary()} onExpand={vi.fn()} />)

    expect(screen.getByTestId('measure-tile-ta')).toHaveTextContent('5,2')
    expect(screen.getByTestId('measure-tile-ta')).toHaveTextContent('Δ 24 h −3,2 °C')
    expect(document.querySelector('[data-testid="measure-tile-ta"] svg')).toBeInTheDocument()
    expect(document.querySelector('[data-testid="measure-tile-ta"] svg')).toHaveAttribute('aria-hidden')
  })

  it('shows the no-data state when summary is null', () => {
    render(<MeasureTile measure="ta" summary={null} onExpand={vi.fn()} />)

    expect(screen.getByText('Aucune mesure sur cette période')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agrandir Température ambiante' })).toBeDisabled()
  })

  it('shows the no-data state when count is zero', () => {
    render(<MeasureTile measure="ta" summary={summary({ count: 0 })} onExpand={vi.fn()} />)
    expect(screen.getByText('Aucune mesure sur cette période')).toBeInTheDocument()
  })

  it('calls onExpand when the expand button is clicked', () => {
    const onExpand = vi.fn()
    render(<MeasureTile measure="ta" summary={summary()} onExpand={onExpand} />)

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir Température ambiante' }))
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('shows the excursions badge only when count > 0', () => {
    const { rerender } = render(
      <MeasureTile measure="ta" summary={summary({ excursions: null })} onExpand={vi.fn()} />,
    )
    expect(screen.queryByTestId('measure-tile-excursions')).not.toBeInTheDocument()

    rerender(
      <MeasureTile
        measure="ta"
        summary={summary({ excursions: { count: 0, total: 60, low: 2, high: 8, lastAt: null } })}
        onExpand={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('measure-tile-excursions')).not.toBeInTheDocument()

    rerender(
      <MeasureTile
        measure="ta"
        summary={summary({ excursions: { count: 3, total: 60, low: 2, high: 8, lastAt: null } })}
        onExpand={vi.fn()}
      />,
    )
    expect(screen.getByTestId('measure-tile-excursions')).toHaveTextContent('3/60 hors 2,0–8,0 °C')
  })
})
