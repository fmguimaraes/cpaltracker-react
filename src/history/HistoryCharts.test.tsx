import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryRow, MeasureKey, MeasureSummary } from '../api/history'
import { HistoryCharts } from './HistoryCharts'

/**
 * KAN-175 (FR19, FR20) — real Plotly (`plotly.js-dist-min`) both renders
 * onto a `<canvas>` AND probes WebGL/Canvas support as an import-time side
 * effect, neither of which jsdom implements. Mocked here too since
 * `HistoryCharts` mounts `MeasureChartModal`, which still uses the real
 * `TimeSeriesChart` once a tile is expanded.
 */
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
    last: 20,
    lastAt: null,
    min: 18,
    max: 22,
    minAt: null,
    maxAt: null,
    mean: 20,
    count: 10,
    periodChange: 0,
    change24h: 0.5,
    change24hRef: null,
    trend: 'stable',
    excursions: null,
    sparkline: [['2026-01-01T00:00:00Z', 20]],
    ...overrides,
  }
}

const noSummaries: Record<MeasureKey, MeasureSummary | null> = { ta: null, hr: null, m: null }

describe('HistoryCharts (KAN-232 FR10, FR11, FR12)', () => {
  it('shows an empty-state message instead of tiles when there are no rows', () => {
    render(<HistoryCharts rows={[]} summaries={noSummaries} />)
    expect(screen.getByTestId('history-charts-empty')).toBeInTheDocument()
  })

  it('renders one tile per measure (temperature, humidity, mass)', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 20, hr: 50, m: 300 })]
    render(<HistoryCharts rows={rows} summaries={noSummaries} />)
    expect(screen.getByTestId('history-chart-ta')).toBeInTheDocument()
    expect(screen.getByTestId('history-chart-hr')).toBeInTheDocument()
    expect(screen.getByTestId('history-chart-m')).toBeInTheDocument()
  })

  it('opens the modal with the matching measure selected when a tile is expanded', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 20 })]
    render(
      <HistoryCharts rows={rows} summaries={{ ...noSummaries, hr: summary({ label: 'Humidité relative' }) }} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agrandir Humidité relative' }))

    expect(screen.getByTestId('measure-chart-modal')).toBeInTheDocument()
    expect(screen.getByTestId('measure-tab-hr')).toHaveAttribute('aria-pressed', 'true')
  })

  it('makes no network call when rendering tiles (client-side only)', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 20 })]
    render(<HistoryCharts rows={rows} visibleDeviceIds={['CHIP-A']} summaries={noSummaries} />)

    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
