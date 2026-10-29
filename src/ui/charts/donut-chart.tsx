import type { Data, Layout } from 'plotly.js'
import { Plot } from './plot'
import { useChartTheme } from './use-chart-theme'

export interface DonutSlice {
  label: string
  value: number
  /** Index into chart palette, or 'warning' | 'danger' | 'success'. */
  color: number | 'warning' | 'danger' | 'success'
}

interface Props {
  slices: DonutSlice[]
  centerLabel: string
  label: string
  className?: string
}

export function DonutChart({ slices, centerLabel, label, className }: Props) {
  const t = useChartTheme()
  const total = slices.reduce((s, x) => s + x.value, 0)
  const pick = (c: DonutSlice['color']) => (typeof c === 'number' ? t.colors[c % t.colors.length] : t[c])
  const data: Data[] = [
    {
      type: 'pie',
      hole: 0.62,
      labels: slices.map((s) => s.label),
      values: slices.map((s) => s.value),
      marker: { colors: slices.map((s) => pick(s.color)), line: { color: t.card, width: 2 } },
      textinfo: 'none',
      sort: false,
      direction: 'clockwise',
      hovertemplate: '%{label}: %{value} (%{percent})<extra></extra>',
    },
  ]
  const layout: Partial<Layout> = {
    ...t.layout,
    hovermode: 'closest',
    margin: { l: 8, r: 8, t: 8, b: 8 },
    showlegend: true,
    legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: -0.05, font: { color: t.foreground, family: t.fontSans } },
    annotations: [
      { text: String(total), x: 0.5, y: 0.54, xref: 'paper', yref: 'paper', showarrow: false, font: { family: t.fontSerif, size: 34, color: t.foreground } },
      { text: centerLabel, x: 0.5, y: 0.42, xref: 'paper', yref: 'paper', showarrow: false, font: { family: t.fontSans, size: 12, color: t.axis } },
    ],
  }
  return <Plot label={label} className={className ?? 'h-72 w-full'} data={data} layout={layout} />
}
