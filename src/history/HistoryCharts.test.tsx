import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryRow } from '../api/history'
import { HistoryCharts } from './HistoryCharts'

/**
 * KAN-175 (FR19, FR20) — real Plotly (`plotly.js-dist-min`) both renders
 * onto a `<canvas>` AND probes WebGL/Canvas support as an import-time side
 * effect, neither of which jsdom implements
 * (`HTMLCanvasElement.prototype.getContext` is a documented jsdom gap, same
 * class of limitation `TimelineMap.test.tsx` already hit with Leaflet's SVG
 * renderer — see that file's comment). Mocking both the heavy module AND
 * the `react-plotly.js/factory` wrapper keeps this test about THIS
 * component's own logic (which traces/layout it hands to Plotly, keyed on
 * `rows`/`visibleDeviceIds`) rather than Plotly's internals, which are
 * instead covered in a real browser by `e2e/history-charts.spec.ts`.
 */
vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({
  default: () => (props: { data: Array<{ name: string }>; layout: { title: { text: string } } }) => (
    <div data-testid="mock-plot" data-trace-names={props.data.map((trace) => trace.name).join(',')}>
      {props.layout.title.text}
    </div>
  ),
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

describe('HistoryCharts (KAN-175 FR19, FR20)', () => {
  it('shows an empty-state message instead of charts when there are no rows', () => {
    render(<HistoryCharts rows={[]} />)
    expect(screen.getByTestId('history-charts-empty')).toBeInTheDocument()
  })

  it('renders one chart per field (temperature, humidity, mass)', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 20, hr: 50, m: 300 })]
    render(<HistoryCharts rows={rows} />)
    expect(screen.getByTestId('history-chart-ta')).toBeInTheDocument()
    expect(screen.getByTestId('history-chart-hr')).toBeInTheDocument()
    expect(screen.getByTestId('history-chart-m')).toBeInTheDocument()
  })

  it('only includes visible devices, recomputed with no network call', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const rows = [
      row({ c: 'CHIP-A', t: 1000, ta: 20 }),
      row({ c: 'CHIP-B', t: 1000, ta: 30 }),
    ]
    render(<HistoryCharts rows={rows} visibleDeviceIds={['CHIP-A']} />)

    const tempChart = screen.getByTestId('history-chart-ta').querySelector('[data-testid="mock-plot"]')
    expect(tempChart?.getAttribute('data-trace-names')).toBe('CHIP-A')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
