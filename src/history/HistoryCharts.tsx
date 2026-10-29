import type { HistoryRow } from '../api/history'
import { TimeSeriesChart, type Series } from '@/ui/charts/time-series-chart'
import { WidgetCard } from '@/ui/widget-card'
import { buildChartTraces, CHART_FIELD_LABELS, type ChartField } from './chartData'
import { formatUtc } from './timelineData'

// FR9: the three charts are the kit's `TimeSeriesChart` (Plotly via the kit's `Plot`, themed by
// `useChartTheme`), one `WidgetCard` per `ChartField`.

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
 * data to Plotly's `data`/`layout` props. CB27: the x-axis (FR9) is now date-typed:
 * epoch-ms `t` is formatted in UTC to `yyyy-MM-dd HH:mm:ss` strings (`formatUtc`, the monolith's
 * `formatUTC` as dashboard.php uses it for its axis; no " UTC" suffix on axis values), which
 * Plotly types as dates without shifting them to the browser's time zone, and no `range` is ever
 * set on the y-axis — there is no fixed y-bound/clipping anywhere in this
 * file, matching the legacy chart's explicit "no clipping" behavior
 * (v2.1 changelog removing the 0–1500kg mass-axis limiter).
 *
 * Re-rendered from scratch on every `rows`/`visibleDeviceIds` change
 * (CB26 — Plotly's own React wrapper diffs/redraws internally; this
 * component makes no attempt at incremental updates), and makes no network
 * call of its own — FR20's "no refetch" holds trivially because this
 * component never calls `fetch`.
 *
 * KAN-176 (FR26) — Plotly draws its chart background/gridlines/text as SVG
 * presentation attributes, which never resolve `var(--token)`. KAN-223 (FR4):
 * the kit's `useChartTheme` resolves the theme roles (`--card`,
 * `--foreground`, `--chart-grid`) to concrete colors and re-reads them when
 * `<html data-theme>` changes, so flipping the theme re-themes every chart
 * with no reload (FR26, NFR6 "single state change").
 */
export interface HistoryChartsProps {
  rows: HistoryRow[]
  visibleDeviceIds?: string[] | null
}

const FIELDS: ChartField[] = ['ta', 'hr', 'm']

/** Safe temperature band drawn on the temperature chart (FR9). */
const TEMPERATURE_THRESHOLD = { min: 2, max: 8 }

const FIELD_UNITS: Record<ChartField, string> = { ta: '°C', hr: '%', m: 'kg' }

export function HistoryCharts({ rows, visibleDeviceIds = null }: HistoryChartsProps) {
  const hasRows = rows.length > 0

  if (!hasRows) {
    return (
      <p data-testid="history-charts-empty" className="text-sm text-muted-foreground">
        Aucune mesure à représenter.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4" data-testid="history-charts">
      {FIELDS.map((field) => {
        const traces = buildChartTraces(rows, visibleDeviceIds, field)
        // `TimeSeriesChart` styles series by position (palette cycle + dash/symbol overflow rule):
        // `buildChartTraces` keeps one slot per visible device, so positions match the map (K-7).
        const series: Series[] = traces.map((trace) => ({
          name: trace.chipId,
          x: trace.x.map(formatUtc),
          y: trace.y,
        }))
        const hasPoints = traces.some((trace) => trace.x.length > 0)
        return (
          <div key={field} data-testid={`history-chart-${field}`}>
            <WidgetCard
              title={CHART_FIELD_LABELS[field]}
              empty={hasPoints ? undefined : { title: 'Aucune mesure à représenter.' }}
            >
              <TimeSeriesChart
                className="h-72 w-full"
                series={series}
                unit={FIELD_UNITS[field]}
                threshold={field === 'ta' ? TEMPERATURE_THRESHOLD : undefined}
                label={CHART_FIELD_LABELS[field]}
              />
            </WidgetCard>
          </div>
        )
      })}
    </div>
  )
}
