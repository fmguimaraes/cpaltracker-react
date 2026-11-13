import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryRow, MeasureKey, MeasureSummary } from '../api/history'
import { MeasureChartModal } from './MeasureChartModal'

// See HistoryCharts.test.tsx's comment: Plotly needs a real <canvas> and probes WebGL at import
// time, neither of which jsdom implements.
vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({
  default: () => () => <div data-testid="mock-plot" />,
}))

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

function summary(overrides: Partial<MeasureSummary> = {}): MeasureSummary {
  return {
    label: 'Température ambiante',
    unit: '°C',
    decimals: 1,
    stableBand: 0.5,
    last: 5.2,
    lastAt: null,
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
    sparkline: [],
    ...overrides,
  }
}

function summaries(overrides: Partial<Record<MeasureKey, MeasureSummary | null>> = {}) {
  return { ta: summary(), hr: summary({ label: 'Humidité relative', unit: '%' }), m: null, ...overrides }
}

describe('MeasureChartModal (KAN-232 FR12-FR15)', () => {
  it('shows the title, stats row and chart for the selected measure', () => {
    render(
      <MeasureChartModal
        open
        onOpenChange={vi.fn()}
        measure="ta"
        onMeasureChange={vi.fn()}
        rows={[row({ ta: 5 })]}
        summaries={summaries()}
      />,
    )

    expect(screen.getByTestId('measure-chart-modal')).toHaveTextContent('Température ambiante (°C)')
    expect(screen.getByTestId('measure-stats-row')).toHaveTextContent('Dernière')
    expect(screen.getByTestId('measure-stats-row')).toHaveTextContent('5,2 °C')
    expect(screen.getByTestId('measure-chart-modal-plot')).toBeInTheDocument()
  })

  it('marks the active measure tab with aria-pressed', () => {
    render(
      <MeasureChartModal
        open
        onOpenChange={vi.fn()}
        measure="hr"
        onMeasureChange={vi.fn()}
        rows={[]}
        summaries={summaries()}
      />,
    )

    expect(screen.getByTestId('measure-tab-hr')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('measure-tab-ta')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onMeasureChange when a different tab is clicked', () => {
    const onMeasureChange = vi.fn()
    render(
      <MeasureChartModal
        open
        onOpenChange={vi.fn()}
        measure="ta"
        onMeasureChange={onMeasureChange}
        rows={[]}
        summaries={summaries()}
      />,
    )

    fireEvent.click(screen.getByTestId('measure-tab-m'))
    expect(onMeasureChange).toHaveBeenCalledWith('m')
  })

  it('closes on Escape', () => {
    const onOpenChange = vi.fn()
    render(
      <MeasureChartModal
        open
        onOpenChange={onOpenChange}
        measure="ta"
        onMeasureChange={vi.fn()}
        rows={[]}
        summaries={summaries()}
      />,
    )

    fireEvent.keyDown(screen.getByTestId('measure-chart-modal'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on a backdrop click', async () => {
    const onOpenChange = vi.fn()
    render(
      <MeasureChartModal
        open
        onOpenChange={onOpenChange}
        measure="ta"
        onMeasureChange={vi.fn()}
        rows={[]}
        summaries={summaries()}
      />,
    )

    // Radix's dismissable layer only starts listening for outside pointerdowns after a
    // zero-delay timeout (so the open-triggering click itself is never treated as "outside").
    await new Promise((resolve) => setTimeout(resolve, 0))

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    fireEvent.pointerDown(overlay as Element)
    fireEvent.click(overlay as Element)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
