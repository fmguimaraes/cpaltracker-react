import { describe, expect, it } from 'vitest'
import type { Annotations, PlotData } from 'plotly.js'
import type { AnomalyRow } from '../api/anomalies'
import {
  anomalyTooltip,
  areaPolygons,
  BLOCK_CLASSES,
  blockHeader,
  buildPalletFigure,
  estimateLabelWidth,
  FIGURE_HEIGHT_CLASS,
  figureHeight,
  GEOMETRY,
  gutterFor,
  thresholdLabel,
  type FigureMeasure,
  type FigureTheme,
} from './palletFigure'
import { PALLET_MEASURES, localPlotTime, type PalletMeasureKey } from './palletSeries'

const theme: FigureTheme = {
  colors: ['c1', 'c2', 'c3', 'c4', 'c5'],
  axis: 'axis',
  grid: 'grid',
  card: 'card',
  foreground: 'fg',
  danger: 'red',
  layout: { xaxis: {}, yaxis: {} },
}

const HOUR = 3_600_000
const T0 = Date.UTC(2026, 10, 13, 0)
const range = { from: new Date(T0 - 10 * 24 * HOUR), to: new Date(T0 + 72 * HOUR) }
const NOW = new Date(T0 + 12 * 24 * HOUR)

function anomaly(overrides: Partial<AnomalyRow>): AnomalyRow {
  return {
    anomalyKey: 'ANO-1',
    status: 'detectee',
    code: 'TH',
    label: '',
    threshold: 28,
    value: 31,
    excess: 3,
    unit: '°C',
    eventDate: '2026-11-13 09:00:00',
    detectedAt: '2026-11-13 09:00:00',
    chipId: 'A',
    lot: null,
    ...overrides,
  }
}

const hourly = (count: number, value: (i: number) => number) => ({
  t: Array.from({ length: count }, (_, i) => T0 + i * HOUR),
  values: Array.from({ length: count }, (_, i) => value(i)),
})

/** All four blocks, in order; only `given` have readings. */
function blocks(given: Partial<Record<PalletMeasureKey, { t: number[]; values: number[] }>>): FigureMeasure[] {
  return PALLET_MEASURES.map((measure) => {
    const series = given[measure.key] ?? { t: [], values: [] }
    return { measure, data: { ...series, last: series.values.length ? series.values[series.values.length - 1] : null } }
  })
}

function figure(measures: FigureMeasure[], anomalies: AnomalyRow[] = []) {
  return buildPalletFigure({ measures, anomalies, range, theme, now: NOW })
}

const traces = (data: unknown[], name: string) => (data as Partial<PlotData>[]).filter((trace) => trace.name === name)
const texts = (annotations: Partial<Annotations>[] | undefined) => (annotations ?? []).map((a) => a.text)

describe('figure geometry', () => {
  it('matches the Tailwind heights: 136 px per chart block, 88 per empty one, no bottom pad on the last, 28 px date row', () => {
    expect(figureHeight(4)).toBe(4 * 136 - 16 + 28)
    expect(figureHeight(1)).toBe(136 + 3 * 88 - 16 + 28)
    expect(Object.keys(FIGURE_HEIGHT_CLASS)).toEqual(['1', '2', '3', '4'])
    for (const [charts, className] of Object.entries(FIGURE_HEIGHT_CLASS)) {
      expect(Number(className.slice(2)) * 4).toBe(figureHeight(Number(charts)))
    }
  })

  it('lays the HTML block headers on the same px rhythm as the figure', () => {
    const px = (className: string) => Number(className.split('-')[1]) * 4
    expect(px(BLOCK_CLASSES.padTop)).toBe(GEOMETRY.padTop)
    expect(px(BLOCK_CLASSES.header)).toBe(GEOMETRY.header)
    expect(px(BLOCK_CLASSES.gap)).toBe(GEOMETRY.gap)
    expect(px(BLOCK_CLASSES.plot)).toBe(GEOMETRY.plot)
    expect(px(BLOCK_CLASSES.empty)).toBe(GEOMETRY.empty)
    expect(px(BLOCK_CLASSES.padBottom)).toBe(GEOMETRY.padBottom)
    expect([GEOMETRY.padTop, GEOMETRY.padBottom, GEOMETRY.gap, GEOMETRY.plot]).toEqual([20, 16, 8, 72])
  })

  it('sizes the y gutter to the widest label, capped at 36 px', () => {
    expect(gutterFor(['70', '40'])).toBe(Math.ceil(estimateLabelWidth('70')) + 6)
    expect(gutterFor(['9\u202f300', '8\u202f700'])).toBeGreaterThan(gutterFor(['70', '40']))
    expect(gutterFor(['123\u202f456\u202f789'])).toBe(36)
    expect(gutterFor(['9\u202f300'], () => 40)).toBe(36)
    expect(gutterFor(['70'], () => 10)).toBe(16)
  })
})

describe('buildPalletFigure', () => {
  const temperature = hourly(4, (i) => 20 + i)

  it('heads each block with its uppercase label, its last value without "dernier :", and the date in a tooltip', () => {
    const header = blockHeader(blocks({ ta: temperature })[0], NOW)
    expect(header.label).toBe('TEMPÉRATURE')
    expect(header.value).toBe('23\u00a0°C')
    expect(header.title).toMatch(/^dernier relevé · 13 nov\. \d\d:\d\d$/)
    expect(blockHeader(blocks({})[1], NOW)).toEqual({ label: 'HUMIDITÉ', value: '—', title: null })
  })

  it('gives a metric without readings no axis and a shorter figure, and draws no gridline or header in Plotly', () => {
    const { layout, height } = figure(blocks({ ta: temperature }))
    expect(height).toBe(figureHeight(1))
    expect(layout.yaxis2).toBeUndefined()
    expect(layout.yaxis?.showgrid).toBe(false)
    expect(layout.xaxis?.showgrid).toBe(false)
    expect(texts(layout.annotations)).not.toContain('TEMPÉRATURE')
    expect((layout.shapes ?? []).filter((s) => s.yref === 'paper' && s.type === 'line')).toHaveLength(0)
  })

  it('labels the y axis twice only — the domain max at the top, the min at the bottom — in the gutter', () => {
    const { layout } = figure(blocks({ ta: temperature }))
    const [lo, hi] = layout.yaxis?.range as [number, number]
    const yLabels = (layout.annotations ?? []).filter((a) => a.xanchor === 'right' && a.xref === 'paper' && a.x === 0)
    expect(yLabels.map((a) => [a.text, a.yanchor])).toEqual([
      [String(hi), 'top'],
      [String(lo), 'bottom'],
    ])
    expect(layout.margin?.l).toBeLessThanOrEqual(36)
    expect(layout.margin?.l).toBe(figure(blocks({ ta: temperature })).gutter)
  })

  it('draws a dashed red line for each rule threshold, labelled at the right end, and nothing else', () => {
    const { layout } = figure(blocks({ ta: temperature }), [anomaly({})])
    const lines = (layout.shapes ?? []).filter((s) => s.type === 'line' && s.yref === 'y')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ y0: 28, y1: 28, line: { dash: 'dash', color: 'red' } })
    expect((layout.annotations ?? []).find((a) => a.text === 'seuil 28\u00a0°C')).toMatchObject({ x: 1, xanchor: 'right', y: 28 })
    expect(thresholdLabel(5, '°C')).toBe('seuil 5\u00a0°C')
  })

  it('has no threshold line when the pallet has no anomaly of that kind', () => {
    const { layout } = figure(blocks({ ta: temperature }), [anomaly({ code: 'HH', threshold: 75, value: 80 })])
    expect((layout.shapes ?? []).filter((s) => s.yref === 'y')).toHaveLength(0)
  })

  it('widens the y range to every threshold and anomaly reading', () => {
    const { layout } = figure(blocks({ ta: temperature }), [anomaly({}), anomaly({ anomalyKey: 'L', code: 'TL', threshold: 2, value: 1 })])
    const [lo, hi] = layout.yaxis?.range as [number, number]
    expect(lo).toBeLessThan(1)
    expect(hi).toBeGreaterThan(31)
  })

  it('marks anomalies of the period as red dots, solid while open, hollow once closed, and keeps their key', () => {
    const { data } = figure(blocks({ ta: temperature }), [
      anomaly({ anomalyKey: 'OPEN', status: 'en_cours', eventDate: '2026-11-13 02:00:00' }),
      anomaly({ anomalyKey: 'CLOSED', status: 'fermee', eventDate: '2026-11-13 03:00:00' }),
      anomaly({ anomalyKey: 'OLD', eventDate: '2026-10-01 10:00:00' }),
    ])
    const open = traces(data, 'anomalies-open')[0]
    const closed = traces(data, 'anomalies-closed')[0]
    expect(open.marker).toMatchObject({ symbol: 'circle', color: 'red' })
    expect(closed.marker).toMatchObject({ symbol: 'circle-open', color: 'red' })
    expect((open.customdata as unknown as string[][])[0][1]).toBe('OPEN')
    expect((closed.customdata as unknown as string[][])[0][1]).toBe('CLOSED')
  })

  it('gives each anomaly dot the card’s metric, value, excess, time and status', () => {
    const text = anomalyTooltip(anomaly({}), NOW)
    expect(text).toContain('Température 31\u00a0°C')
    expect(text).toContain('+3\u00a0°C')
    expect(text).toContain('À traiter')
    expect(text.split('<br>')).toHaveLength(3)
  })

  it('draws a line with a light area down to the domain min and a hollow dot on the last reading', () => {
    const { data, layout } = figure(blocks({ ta: temperature }))
    const [lo] = layout.yaxis?.range as [number, number]
    const area = traces(data, 'area')[0]
    expect(area).toMatchObject({ fill: 'toself', opacity: 0.12 })
    expect(Math.min(...(area.y as number[]).filter((y) => y !== null))).toBe(lo)
    expect(traces(data, 'readings')[0].line).toMatchObject({ width: 1.5, color: 'c1' })
    expect(traces(data, 'last')[0]).toMatchObject({ y: [23], marker: { symbol: 'circle-open' } })
  })

  it('shows sparse data (< 3 readings) as points joined by a line, with no area', () => {
    const { data } = figure(blocks({ m: { t: [T0, T0 + 5 * HOUR], values: [12000, 12230] } }))
    const line = traces(data, 'readings')[0]
    expect(line.mode).toBe('lines+markers')
    expect(line.marker?.size).toBe(6)
    expect(traces(data, 'area')).toHaveLength(0)
  })

  it('breaks the line and its area at gaps instead of interpolating, keeping a dot on an isolated reading', () => {
    const t = [T0, T0 + HOUR, T0 + 2 * HOUR, T0 + 30 * HOUR, T0 + 60 * HOUR, T0 + 61 * HOUR]
    const { data } = figure(blocks({ ta: { t, values: [20, 21, 22, 23, 24, 25] } }))
    const line = traces(data, 'readings')[0]
    expect(line.connectgaps).toBe(false)
    expect(line.y).toEqual([20, 21, 22, null, 23, null, 24, 25])
    expect(line.marker?.size).toEqual([0, 0, 0, 0, 5, 0, 0, 0])
    // Two polygons (the isolated reading has none), separated by null.
    expect((traces(data, 'area')[0].y as (number | null)[]).filter((y) => y === null)).toHaveLength(1)
  })

  it('draws acceleration as stems from the domain min and dots, never a line between readings', () => {
    const { data, layout } = figure(blocks({ g: { t: [T0, T0 + 30 * HOUR], values: [1, 6.2] } }))
    const [lo] = layout.yaxis?.range as [number, number]
    const stems = traces(data, 'stems')[0]
    expect(stems.y).toEqual([lo, 1, null, lo, 6.2, null])
    expect(traces(data, 'readings')[0].mode).toBe('markers')
    expect(traces(data, 'area')).toHaveLength(0)
  })

  it('keeps the colour of each metric whichever metrics have readings', () => {
    const { data } = figure(blocks({ m: hourly(4, () => 500) }))
    expect(traces(data, 'readings')[0].line?.color).toBe('c4')
  })

  it('stacks the charts on one shared x axis spanning the data only, with a crosshair across them all', () => {
    const { data, layout } = figure(blocks({ ta: temperature, hr: hourly(4, () => 50) }))
    expect(new Set((data as Partial<PlotData>[]).map((trace) => trace.xaxis))).toEqual(new Set(['x']))
    expect(layout.yaxis?.domain?.[0]).toBeGreaterThan(layout.yaxis2?.domain?.[1] as number)
    const [start, end] = layout.xaxis?.range as [string, string]
    expect(start > localPlotTime(range.from.getTime())).toBe(true)
    expect(start < localPlotTime(T0)).toBe(true)
    expect(end > localPlotTime(T0 + 3 * HOUR)).toBe(true)
    expect(layout.xaxis).toMatchObject({ showspikes: true, spikemode: 'across', anchor: 'y2', showticklabels: false })
  })

  it('labels only the first and last dates under the last chart, with the hour under 48 h', () => {
    const { layout } = figure(blocks({ ta: temperature }))
    const dates = (layout.annotations ?? []).filter((a) => a.xref === 'x')
    expect(dates.map((a) => a.xanchor)).toEqual(['left', 'right'])
    expect(dates[0]).toMatchObject({ yshift: -12, font: { size: 11, color: 'axis' } })
    expect(dates[0].text).toMatch(/^13 nov\. \d\d:\d\d$/)
  })

  it('formats a reading’s tooltip as value + local date/time', () => {
    const line = traces(figure(blocks({ ta: temperature })).data, 'readings')[0]
    expect((line.customdata as unknown as string[])[0]).toMatch(/^20\u00a0°C<br>13 nov\. \d\d:\d\d$/)
  })
})

describe('areaPolygons', () => {
  it('closes each run of two or more readings down to the floor, separated by null', () => {
    const area = areaPolygons([0, HOUR, null, 5 * HOUR, null, 9 * HOUR, 10 * HOUR], [1, 2, null, 3, null, 4, 5], 0)
    expect(area.y).toEqual([1, 2, 0, 0, null, 4, 5, 0, 0])
  })
})
