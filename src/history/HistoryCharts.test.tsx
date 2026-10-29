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
  default: () =>
    (props: {
      data: Array<{ name: string; x: string[]; mode: string; hovertemplate: string }>
      layout: { shapes?: unknown[]; yaxis?: { ticksuffix?: string } }
    }) => (
      <div
        data-testid="mock-plot"
        data-trace-names={props.data.map((trace) => trace.name).join(',')}
        data-x={props.data[0]?.x.join('|')}
        data-modes={props.data.map((trace) => trace.mode).join(',')}
        data-shapes={String(props.layout.shapes?.length ?? 0)}
        data-suffix={props.layout.yaxis?.ticksuffix}
      />
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

  it('draws the 2-8 \u00b0C band on the temperature chart only, with a per-field unit (FR9)', () => {
    const rows = [row({ c: 'CHIP-A', t: 1000, ta: 5, hr: 50, m: 300 })]
    render(<HistoryCharts rows={rows} />)

    const plotOf = (field: string) =>
      screen.getByTestId(`history-chart-${field}`).querySelector('[data-testid="mock-plot"]')
    expect(plotOf('ta')?.getAttribute('data-shapes')).toBe('4')
    expect(plotOf('hr')?.getAttribute('data-shapes')).toBe('0')
    expect(plotOf('ta')?.getAttribute('data-suffix')).toBe(' \u00b0C')
    expect(plotOf('hr')?.getAttribute('data-suffix')).toBe(' %')
    expect(plotOf('m')?.getAttribute('data-suffix')).toBe(' kg')
  })

  it('feeds the x-axis UTC date strings, as the monolith formatUTC, not epoch numbers nor local time (FR9)', () => {
    // 23:30 UTC is already the next day in any zone east of UTC, so a local-time format would differ.
    const rows = [row({ c: 'CHIP-A', t: Date.UTC(2026, 9, 1, 23, 30, 5), ta: 5 })]
    render(<HistoryCharts rows={rows} />)

    const plot = screen.getByTestId('history-chart-ta').querySelector('[data-testid="mock-plot"]')
    expect(plot?.getAttribute('data-x')).toBe('2026-10-01 23:30:05')
  })

  it('adds markers from the second palette pass on (more than 5 devices)', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ c: `CHIP-${i}`, t: 1000 + i, ta: 5 }))
    render(<HistoryCharts rows={rows} />)

    const modes = screen
      .getByTestId('history-chart-ta')
      .querySelector('[data-testid="mock-plot"]')
      ?.getAttribute('data-modes')
      ?.split(',')
    expect(modes?.slice(0, 5)).toEqual(Array(5).fill('lines'))
    expect(modes?.[5]).toBe('lines+markers')
  })
})
