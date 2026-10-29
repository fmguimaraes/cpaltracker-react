import type { Data, Layout } from 'plotly.js'
import { Plot } from './plot'
import { useChartTheme } from './use-chart-theme'

export interface BarDatum {
  label: string
  value: number
}

interface Props {
  data: BarDatum[]
  /** Keep only the N largest (ranked list). */
  top?: number
  label: string
  className?: string
}

/** Horizontal ranked bars (top N, largest first). */
export function RankedBars({ data, top = 5, label, className }: Props) {
  const t = useChartTheme()
  const rows = [...data].sort((a, b) => b.value - a.value).slice(0, top).reverse()
  const traces: Data[] = [
    {
      type: 'bar',
      orientation: 'h',
      x: rows.map((r) => r.value),
      y: rows.map((r) => r.label),
      marker: { color: t.colors[0] },
      text: rows.map((r) => String(r.value)),
      textposition: 'outside',
      textfont: { color: t.foreground },
      cliponaxis: false,
      hovertemplate: '%{y}: %{x}<extra></extra>',
    },
  ]
  const layout: Partial<Layout> = {
    ...t.layout,
    hovermode: 'closest',
    margin: { l: 120, r: 32, t: 8, b: 24 },
    xaxis: { ...t.layout.xaxis, showgrid: true },
    yaxis: { ...t.layout.yaxis, showgrid: false, automargin: true, tickfont: { color: t.foreground } },
  }
  return <Plot label={label} className={className ?? 'h-64 w-full'} data={traces} layout={layout} />
}

export { RankedBars as BarChart }
