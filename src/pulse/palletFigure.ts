import type { Annotations, Data, Layout, Shape } from 'plotly.js'
import type { AnomalyRow } from '../api/anomalies'
import { anomalyCardContent, formatAbsolute, formatMeasure, isClosed, parseUtc, ruleDisplay } from '../anomalies/anomalyCard'
import { STATUS_LABEL } from '../anomalies/anomalyFormat'
import {
  breakAtGaps,
  dataExtent,
  extentLabels,
  localPlotTime,
  PALLET_MEASURES,
  ruleThresholds,
  yDomain,
  yLabels,
  type DataExtent,
  type PalletMeasure,
  type PalletSeries,
} from './palletSeries'

/**
 * The pallet's charts as ONE Plotly figure: one stacked chart per measure, all on the same x axis.
 * Sharing the axis gives, natively and without React state, the same x-domain, aligned plot areas and a
 * hover crosshair (spike, `spikemode: 'across'`) crossing every chart. The block headers (label, value)
 * and dividers are HTML laid over the figure (`PalletPanel`), with Tailwind classes whose sizes are the
 * px below (`BLOCK_CLASSES`, checked by a test), so CSS typography is available and nothing drifts.
 */

/** Pixel geometry of a metric block (the owner's targets). */
export const GEOMETRY = {
  padTop: 20,
  /** Header row (label + value). */
  header: 20,
  /** Header row → plot. */
  gap: 8,
  plot: 72,
  /** A metric without readings: a single "Aucun relevé" row instead of the plot. */
  empty: 24,
  /** Every block but the last (the last is followed by the date row). */
  padBottom: 16,
  /** Under the last chart: 12 px, then the dates (11 px). */
  axis: 28,
  right: 4,
  /** The y-label gutter never exceeds this. */
  maxGutter: 36,
} as const

/** The Tailwind classes of the HTML block overlay, the same px as `GEOMETRY` (spacing unit 4 px). */
export const BLOCK_CLASSES = {
  padTop: 'pt-5',
  header: 'h-5',
  gap: 'mb-2',
  plot: 'h-18',
  empty: 'h-6',
  padBottom: 'pb-4',
} as const

const FULL_BLOCK = GEOMETRY.padTop + GEOMETRY.header + GEOMETRY.gap + GEOMETRY.plot + GEOMETRY.padBottom
const EMPTY_BLOCK = GEOMETRY.padTop + GEOMETRY.header + GEOMETRY.gap + GEOMETRY.empty + GEOMETRY.padBottom

/** Figure height in px for the four blocks, `charts` of which have readings (the last block has no bottom padding). */
export function figureHeight(charts: number, blocks = PALLET_MEASURES.length): number {
  return charts * FULL_BLOCK + (blocks - charts) * EMPTY_BLOCK - GEOMETRY.padBottom + GEOMETRY.axis
}

/** The same heights as Tailwind classes, by number of charts with readings: 556, 508, 460, 412 px. */
export const FIGURE_HEIGHT_CLASS: Record<number, string> = { 4: 'h-139', 3: 'h-127', 2: 'h-115', 1: 'h-103' }

/** Width in px of a 10 px y label; `measure` is the browser's canvas when available. */
export type TextMeasure = (text: string) => number

/** Without a canvas (tests, SSR): ~0.58 em per digit or sign, ~0.3 em per separator, at 10 px. */
export function estimateLabelWidth(text: string): number {
  return [...text].reduce((width, char) => width + (/[0-9+\-−]/.test(char) ? 5.8 : 3), 0)
}

/** The y-label gutter: the widest label plus 6 px of air, capped at `GEOMETRY.maxGutter`. */
export function gutterFor(labels: readonly string[], measure: TextMeasure = estimateLabelWidth): number {
  const widest = Math.max(0, ...labels.map(measure))
  return Math.min(GEOMETRY.maxGutter, Math.ceil(widest) + 6)
}

/** The resolved theme colours the figure needs (a `ChartTheme` subset, so tests can pass plain strings). */
export interface FigureTheme {
  colors: string[]
  axis: string
  grid: string
  card: string
  foreground: string
  danger: string
  layout: Partial<Layout>
}

export interface FigureMeasure {
  measure: PalletMeasure
  data: PalletSeries
}

/** Plotly `customdata` of an anomaly dot: its tooltip text and its key (the click opens it). */
export type AnomalyPointData = [string, string]

/** "Température 31 °C<br>+3 °C · 14 nov. 09:00<br>À traiter": the card's own content, on three lines. */
export function anomalyTooltip(row: AnomalyRow, now: Date): string {
  const card = anomalyCardContent(row, { showName: false, now })
  return [
    [card.title, card.measure].filter(Boolean).join(' '),
    [card.excess, card.time?.absolute].filter(Boolean).join(' · '),
    STATUS_LABEL[row.status],
  ]
    .filter(Boolean)
    .join('<br>')
}

/** "seuil 28 °C". */
export function thresholdLabel(value: number, unit: string): string {
  return `seuil ${formatMeasure(value, unit)}`
}

interface Dot {
  row: AnomalyRow
  at: number
  value: number
}

/** The anomalies drawn on a chart: of its kind, inside the period, with a reading to place the dot. */
function dotsOf(anomalies: readonly AnomalyRow[], measure: PalletMeasure, range: { from: Date; to: Date }): Dot[] {
  const from = range.from.getTime()
  const to = range.to.getTime()
  return anomalies.flatMap((row) => {
    const at = parseUtc(row.eventDate)?.getTime()
    if (row.value === null || at === undefined || at < from || at > to) return []
    return ruleDisplay(row.code)?.kind === measure.kind ? [{ row, at, value: row.value }] : []
  })
}

/** First → last instant with data in the period (readings of every measure and anomaly dots): the x-domain. */
export function palletExtent(
  measures: readonly FigureMeasure[],
  anomalies: readonly AnomalyRow[],
  range: { from: Date; to: Date },
): DataExtent | null {
  return dataExtent(
    measures.flatMap(({ measure, data }) => [...data.t, ...dotsOf(anomalies, measure, range).map((dot) => dot.at)]),
  )
}

function axisName(prefix: 'y' | 'yaxis', index: number): string {
  return index === 0 ? prefix : `${prefix}${index + 1}`
}

/** A block's header row: the uppercase label, the last value ("22 °C", or "—") and its date tooltip. */
export function blockHeader({ measure, data }: FigureMeasure, now: Date): { label: string; value: string; title: string | null } {
  const lastAt = data.t[data.t.length - 1]
  return {
    label: measure.label.toLocaleUpperCase('fr-FR'),
    value: data.last === null ? '—' : formatMeasure(data.last, measure.unit),
    title: data.last === null ? null : `dernier relevé · ${formatAbsolute(new Date(lastAt), now)}`,
  }
}

export function buildPalletFigure({
  measures,
  anomalies,
  range,
  theme,
  now = new Date(),
  measureText,
}: {
  /** Every block in display order; a measure without readings gets the short "Aucun relevé" row. */
  measures: FigureMeasure[]
  /** This pallet's anomalies, all of them: their thresholds are its rules, those inside the range are dotted. */
  anomalies: readonly AnomalyRow[]
  range: { from: Date; to: Date }
  theme: FigureTheme
  now?: Date
  /** Width of a 10 px y label (canvas in the browser); a character estimate otherwise. */
  measureText?: TextMeasure
}): { data: Data[]; layout: Partial<Layout>; height: number; gutter: number } {
  const { padTop, header, gap, plot, empty, padBottom, axis, right } = GEOMETRY
  const charts = measures.filter(({ data }) => data.values.length > 0).length
  const height = figureHeight(charts, measures.length)
  // The plot area ends with the last block (no bottom padding); the date row is the bottom margin.
  const plotArea = height - axis
  // Plotly places by paper fraction of the plot area: px measured from its top → fraction.
  const paper = (px: number) => 1 - px / plotArea
  const data: Data[] = []
  const shapes: Partial<Shape>[] = []
  const annotations: Partial<Annotations>[] = []
  const yaxes: Partial<Layout> = {}
  const muted = { color: theme.axis, size: 10 }

  // First pass: each chart's domain and labels, so one gutter (the widest label) aligns every chart.
  const charted = measures.map(({ measure, data: series }) => {
    if (series.values.length === 0) return null
    const thresholds = ruleThresholds(anomalies, measure.kind)
    const dots = dotsOf(anomalies, measure, range)
    const domain = yDomain(measure, series.values, [...thresholds, ...dots.map((dot) => dot.value)])
    return { thresholds, dots, domain, labels: yLabels(domain) }
  })
  const gutter = gutterFor(charted.flatMap((chart) => chart?.labels ?? []), measureText)

  let top = 0
  let axisIndex = 0
  let lastAxis = 'y'

  measures.forEach(({ measure, data: series }, index) => {
    const { unit } = measure
    const color = theme.colors[Math.max(PALLET_MEASURES.findIndex((m) => m.key === measure.key), 0) % theme.colors.length]
    const plotTop = top + padTop + header + gap
    const chart = charted[index]
    const plotBottom = plotTop + (chart ? plot : empty)
    top = plotBottom + padBottom
    if (!chart) return

    const lastAt = series.t[series.t.length - 1]
    const yref = axisName('y', axisIndex) as 'y'
    const yaxis = axisName('yaxis', axisIndex) as 'yaxis'
    axisIndex += 1
    lastAxis = yref

    const { thresholds, dots, domain } = chart
    const [lo, hi] = domain
    yaxes[yaxis] = {
      domain: [paper(plotBottom), paper(plotTop)],
      anchor: 'x',
      range: domain,
      showticklabels: false,
      showgrid: false,
      zeroline: false,
      showline: false,
      showspikes: false,
      fixedrange: true,
    }

    // Two y labels only, in the band of the plot (never the header's): the domain max at its top edge,
    // the min at its bottom edge, right-aligned in the gutter.
    const [maxLabel, minLabel] = chart.labels
    for (const [text, y, yanchor] of [
      [maxLabel, plotTop, 'top'],
      [minLabel, plotBottom, 'bottom'],
    ] as const) {
      annotations.push({
        xref: 'paper',
        x: 0,
        xshift: -3,
        xanchor: 'right',
        yref: 'paper',
        y: paper(y),
        yanchor,
        text,
        showarrow: false,
        font: muted,
      })
    }

    const readingText = (t: number, value: number) => `${formatMeasure(value, unit)}<br>${formatAbsolute(new Date(t), now)}`
    const hover = { hovertemplate: '%{customdata}<extra></extra>', hoverlabel: { bordercolor: color } }

    if (measure.style === 'stems') {
      // Lollipops: one vertical segment per reading from the domain min, then its dot. Never a line between readings.
      data.push({
        type: 'scatter',
        mode: 'lines',
        xaxis: 'x',
        yaxis: yref,
        x: series.t.flatMap((t) => [localPlotTime(t), localPlotTime(t), null]),
        y: series.values.flatMap((value) => [lo, value, null]),
        line: { color, width: 1 },
        connectgaps: false,
        hoverinfo: 'skip',
        showlegend: false,
        name: 'stems',
      })
      data.push({
        type: 'scatter',
        mode: 'markers',
        xaxis: 'x',
        yaxis: yref,
        x: series.t.map(localPlotTime),
        y: series.values,
        customdata: series.t.map((t, i) => readingText(t, series.values[i])),
        marker: { color, size: 5 },
        cliponaxis: false,
        showlegend: false,
        name: 'readings',
        ...hover,
      })
    } else {
      const gapped = breakAtGaps(series)
      const sparse = series.values.length < 3
      if (!sparse) {
        // Light area from the domain min (not 0) to the line: one closed polygon per unbroken segment.
        const area = areaPolygons(gapped.t, gapped.values, lo)
        data.push({
          type: 'scatter',
          mode: 'lines',
          xaxis: 'x',
          yaxis: yref,
          x: area.x,
          y: area.y,
          fill: 'toself',
          fillcolor: color,
          opacity: 0.12,
          line: { width: 0, color },
          hoverinfo: 'skip',
          showlegend: false,
          name: 'area',
        })
      }
      // A reading cut off on both sides by gaps would be an invisible one-point line: it keeps a dot.
      const isolated = gapped.t.map((t, i) => t !== null && gapped.t[i - 1] == null && gapped.t[i + 1] == null)
      data.push({
        type: 'scatter',
        mode: 'lines+markers',
        xaxis: 'x',
        yaxis: yref,
        x: gapped.t.map((t) => (t === null ? null : localPlotTime(t))),
        y: gapped.values,
        connectgaps: false,
        line: { color, width: 1.5 },
        // Sparse data (2–3 readings): points joined by the line, no area, so it never reads as a bar.
        marker: { color, size: sparse ? 6 : isolated.map((alone) => (alone ? 5 : 0)) },
        cliponaxis: false,
        // Null separators carry no text, so the customdata stays aligned on the gapped x.
        customdata: gapped.t.map((t, i) => (t === null ? '' : readingText(t, gapped.values[i] as number))),
        showlegend: false,
        name: 'readings',
        ...hover,
      })
      data.push({
        type: 'scatter',
        mode: 'markers',
        xaxis: 'x',
        yaxis: yref,
        x: [localPlotTime(lastAt)],
        y: [series.last as number],
        marker: { symbol: 'circle-open', color, size: 8, line: { color, width: 1.5 } },
        cliponaxis: false,
        hoverinfo: 'skip',
        showlegend: false,
        name: 'last',
      })
    }

    for (const value of thresholds) {
      shapes.push({
        type: 'line',
        xref: 'paper',
        x0: 0,
        x1: 1,
        yref,
        y0: value,
        y1: value,
        line: { color: theme.danger, width: 1, dash: 'dash' },
      })
      // Above the line at the right end; under it when it would run into the header row.
      const fromTop = ((hi - value) / (hi - lo)) * plot
      annotations.push({
        xref: 'paper',
        x: 1,
        xanchor: 'right',
        yref,
        y: value,
        yanchor: fromTop < 13 ? 'top' : 'bottom',
        text: thresholdLabel(value, unit),
        showarrow: false,
        font: { color: theme.danger, size: 10 },
      })
    }

    // Anomaly dots: solid while to handle or in progress, hollow once closed.
    for (const closed of [false, true]) {
      const group = dots.filter((dot) => isClosed(dot.row.status) === closed)
      if (group.length === 0) continue
      data.push({
        type: 'scatter',
        mode: 'markers',
        xaxis: 'x',
        yaxis: yref,
        x: group.map((dot) => localPlotTime(dot.at)),
        y: group.map((dot) => dot.value),
        customdata: group.map((dot): AnomalyPointData => [anomalyTooltip(dot.row, now), dot.row.anomalyKey]) as unknown as string[],
        hovertemplate: '%{customdata[0]}<extra></extra>',
        hoverlabel: { bordercolor: theme.danger },
        marker: closed
          ? { symbol: 'circle-open', color: theme.danger, size: 9, line: { color: theme.danger, width: 2 } }
          : { symbol: 'circle', color: theme.danger, size: 9, line: { color: theme.card, width: 1 } },
        cliponaxis: false,
        showlegend: false,
        name: closed ? 'anomalies-closed' : 'anomalies-open',
      })
    }
  })

  // x-domain: the data's own extent in the period (not the whole period), a hair wider so end dots show.
  const extent = palletExtent(measures, anomalies, range)
  if (extent) {
    const [firstLabel, lastLabel] = extentLabels(extent)
    const single = extent.first === extent.last
    const edges: [number, string, 'left' | 'right' | 'center'][] = single
      ? [[extent.first, firstLabel, 'center']]
      : [
          [extent.first, firstLabel, 'left'],
          [extent.last, lastLabel, 'right'],
        ]
    for (const [at, text, xanchor] of edges) {
      annotations.push({
        xref: 'x',
        x: localPlotTime(at),
        xanchor,
        yref: 'paper',
        y: 0,
        yanchor: 'top',
        yshift: -12,
        text,
        showarrow: false,
        font: { color: theme.axis, size: 11 },
      })
    }
  }

  return {
    data,
    height,
    gutter,
    layout: {
      ...theme.layout,
      ...yaxes,
      height,
      showlegend: false,
      margin: { l: gutter, r: right, t: 0, b: axis, pad: 0 },
      // `closest` keeps each tooltip to what is under the cursor (a reading, or an anomaly dot to click),
      // while the x spike below still crosses every chart.
      hovermode: 'closest',
      hoverdistance: 24,
      // Not in @types/plotly.js, but a Plotly layout attribute: the spike follows the cursor anywhere.
      ...({ spikedistance: -1 } as Partial<Layout>),
      xaxis: {
        type: 'date',
        anchor: lastAxis as 'y',
        range: extent ? xRange(extent) : [localPlotTime(range.from.getTime()), localPlotTime(range.to.getTime())],
        showticklabels: false,
        showgrid: false,
        zeroline: false,
        showline: false,
        fixedrange: true,
        showspikes: true,
        spikemode: 'across',
        spikesnap: 'cursor',
        spikethickness: 1,
        spikedash: 'dot',
        spikecolor: theme.axis,
      },
      shapes,
      annotations,
    },
  }
}

const HOUR = 3_600_000

/** The extent padded by 3% (an hour each side for a single instant), as local Plotly dates. */
function xRange({ first, last }: DataExtent): [string, string] {
  const margin = last === first ? HOUR : (last - first) * 0.03
  return [localPlotTime(first - margin), localPlotTime(last + margin)]
}

/**
 * Closed polygons under each unbroken run of the line, down to `floor`, separated by null (Plotly's
 * `toself` fills each one on its own, so no area ever spans a gap).
 */
export function areaPolygons(
  t: readonly (number | null)[],
  values: readonly (number | null)[],
  floor: number,
): { x: (string | null)[]; y: (number | null)[] } {
  const x: (string | null)[] = []
  const y: (number | null)[] = []
  let run: [number, number][] = []
  const flush = () => {
    if (run.length >= 2) {
      if (x.length > 0) {
        x.push(null)
        y.push(null)
      }
      for (const [at, value] of run) {
        x.push(localPlotTime(at))
        y.push(value)
      }
      x.push(localPlotTime(run[run.length - 1][0]), localPlotTime(run[0][0]))
      y.push(floor, floor)
    }
    run = []
  }
  t.forEach((at, i) => {
    if (at === null || values[i] === null) flush()
    else run.push([at, values[i] as number])
  })
  flush()
  return { x, y }
}
