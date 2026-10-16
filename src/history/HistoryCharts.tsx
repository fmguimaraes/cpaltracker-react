import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
import type { HistoryRow } from '../api/history'
import { buildChartTraces, CHART_FIELD_LABELS, type ChartField } from './chartData'

// NFR1 — bundled via the `./factory` entry point with `plotly.js-dist-min`
// (the slimmer pre-built bundle, no CDN/`unpkg` fetch), instead of
// `react-plotly.js`'s own default export, which imports the full
// `plotly.js` package directly and cannot be redirected to a smaller
// bundle.
const Plot = createPlotlyComponent(Plotly)

/**
 * KAN-175 (FR19, FR20, NFR1) — the three Plotly charts (temperature,
 * humidity, mass), one `<Plot>` per `ChartField`. Bundled via
 * `plotly.js-dist-min`/`react-plotly.js` per the stack decision (NFR1 — no
 * CDN, same bundling approach KAN-174 used for Leaflet).
 *
 * All the trace-building (per-device series, null/NaN filtering, color
 * reuse from the map's own palette) lives in `chartData.ts`, kept pure so
 * it needs no chart library to unit-test (same split as
 * `TimelineMap.tsx`/`timelineData.ts`) — this component only maps that pure
 * data to Plotly's `data`/`layout` props. CB27: the x-axis is left at
 * Plotly's default `'linear'` type (never `'date'`), and no `range` is ever
 * set on the y-axis — there is no fixed y-bound/clipping anywhere in this
 * file, matching the legacy chart's explicit "no clipping" behavior
 * (v2.1 changelog removing the 0–1500kg mass-axis limiter).
 *
 * Re-rendered from scratch on every `rows`/`visibleDeviceIds` change
 * (CB26 — Plotly's own React wrapper diffs/redraws internally; this
 * component makes no attempt at incremental updates), and makes no network
 * call of its own — FR20's "no refetch" holds trivially because this
 * component never calls `fetch`.
 */
export interface HistoryChartsProps {
  rows: HistoryRow[]
  visibleDeviceIds?: string[] | null
}

const FIELDS: ChartField[] = ['ta', 'hr', 'm']

export function HistoryCharts({ rows, visibleDeviceIds = null }: HistoryChartsProps) {
  const hasRows = rows.length > 0

  if (!hasRows) {
    return (
      <p data-testid="history-charts-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucune mesure à représenter.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="history-charts">
      {FIELDS.map((field) => {
        const traces = buildChartTraces(rows, visibleDeviceIds, field)
        return (
          <div key={field} data-testid={`history-chart-${field}`}>
            <Plot
              // `'scatter'` (SVG), not `'scattergl'`: the server already
              // caps any single response at `MAX_POINTS = 25000` total
              // across ALL devices (CB10), so SVG rendering stays
              // responsive at this scale without needing a WebGL context —
              // which also keeps this chart portable to headless/CI
              // browsers with no GPU.
              data={traces.map((trace) => ({
                x: trace.x,
                y: trace.y,
                type: 'scatter',
                mode: 'lines+markers',
                name: trace.chipId,
                line: { color: trace.color },
                marker: { color: trace.color, size: 4 },
              }))}
              layout={{
                title: { text: CHART_FIELD_LABELS[field] },
                autosize: true,
                height: 260,
                margin: { l: 50, r: 20, t: 40, b: 40 },
                xaxis: { title: { text: 'Horodatage (époque, ms)' } },
                yaxis: { title: { text: CHART_FIELD_LABELS[field] } },
                showlegend: true,
              }}
              style={{ width: '100%' }}
              useResizeHandler
              config={{ responsive: true, displaylogo: false }}
            />
          </div>
        )
      })}
    </div>
  )
}
