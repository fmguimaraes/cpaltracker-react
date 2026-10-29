import type { Data, Layout } from 'plotly.js'
import { Plot } from './plot'
import { useChartTheme } from './use-chart-theme'

interface Props {
  values: number[]
  label: string
  /** Series index: colour cycles --chart-1..5, dash changes per cycle (see seriesStyle). */
  color?: number
  className?: string
}

export function Sparkline({ values, label, color = 0, className }: Props) {
  const t = useChartTheme()
  const st = t.seriesStyle(color)
  const data: Data[] = [
    { type: 'scatter', mode: 'lines', y: values, line: { color: t.colors[st.colorIndex], width: 2, dash: st.dash }, hoverinfo: 'skip' },
  ]
  const layout: Partial<Layout> = {
    ...t.layout,
    hovermode: false,
    margin: { l: 2, r: 2, t: 2, b: 2 },
    xaxis: { visible: false, fixedrange: true },
    yaxis: { visible: false, fixedrange: true },
  }
  return <Plot label={label} className={className ?? 'h-10 w-28'} data={data} layout={layout} />
}
