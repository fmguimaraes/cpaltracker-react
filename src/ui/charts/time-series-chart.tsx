import type { Data, Layout, Shape } from 'plotly.js'
import { Plot } from './plot'
import { useChartTheme } from './use-chart-theme'

export interface Series {
  name: string
  x: string[]
  y: (number | null)[]
}

interface Props {
  series: Series[]
  /** Safe range band, e.g. 2–8 °C. Out-of-range areas are shaded. */
  threshold?: { min: number; max: number }
  unit?: string
  label: string
  className?: string
}

export function TimeSeriesChart({ series, threshold, unit = '°C', label, className }: Props) {
  const t = useChartTheme()
  const all = series.flatMap((s) => s.y.filter((v): v is number => v != null))
  const lo = Math.min(...all, threshold?.min ?? Infinity) - 1
  const hi = Math.max(...all, threshold?.max ?? -Infinity) + 1
  const shapes: Partial<Shape>[] = threshold
    ? [
        { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: threshold.max, y1: hi, fillcolor: t.danger, opacity: 0.14, line: { width: 0 }, layer: 'below' },
        { type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: lo, y1: threshold.min, fillcolor: t.danger, opacity: 0.14, line: { width: 0 }, layer: 'below' },
        { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: threshold.max, y1: threshold.max, line: { color: t.warning, width: 1, dash: 'dot' } },
        { type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: threshold.min, y1: threshold.min, line: { color: t.warning, width: 1, dash: 'dot' } },
      ]
    : []
  const data: Data[] = series.map((s, i) => {
    const st = t.seriesStyle(i)
    const color = t.colors[st.colorIndex]
    return {
      type: 'scatter',
      // from the second palette pass on, add a marker symbol (every ~12th point) next to the dash
      mode: st.cycle > 0 ? 'lines+markers' : 'lines',
      name: s.name,
      x: s.x,
      y: s.y,
      line: { color, width: 2, dash: st.dash, shape: 'spline', smoothing: 0.4 },
      marker: { color, symbol: st.symbol, size: 7, maxdisplayed: 12 },
      hovertemplate: `%{y:.1f} ${unit}<extra>${s.name}</extra>`,
    }
  })
  const layout: Partial<Layout> = {
    ...t.layout,
    shapes,
    showlegend: series.length > 1,
    legend: { ...t.layout.legend, orientation: 'h', y: -0.2 },
    yaxis: { ...t.layout.yaxis, range: [lo, hi], ticksuffix: ` ${unit}` },
    margin: { l: 56, r: 12, t: 12, b: 36 },
  }
  return <Plot label={label} className={className} data={data} layout={layout} />
}
