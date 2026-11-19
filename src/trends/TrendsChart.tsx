import type { Data, Layout, Shape } from 'plotly.js'
import type { TrendsLot } from '../api/trends'
import { Plot } from '@/ui/charts/plot'
import { useChartTheme } from '@/ui/charts/use-chart-theme'
import { RISK_META, RISK_ORDER, Z_CLAMP, clampZ, daysToExpiry } from './trendsData'

/**
 * KAN-256 — risk quadrant drawn with Plotly directly (via the kit `Plot` wrapper): x = days to expiry,
 * y = stored z (clamped to ±5), bands and lines at z = 0 and z = 1, one trace per risk (colour and shape).
 */
export function TrendsChart({ lots, onSelect }: { lots: TrendsLot[]; onSelect: (cpalLot: string) => void }) {
  const t = useChartTheme()
  const color = { eleve: t.danger, moyen: t.warning, faible: t.success }
  const edge = Z_CLAMP + 0.5

  const traces: Data[] = RISK_ORDER.map((risk) => {
    const own = lots.filter((l) => l.risk === risk)
    return {
      type: 'scatter',
      mode: 'markers',
      name: RISK_META[risk].label,
      x: own.map((l) => daysToExpiry(l.expiryDate)),
      y: own.map((l) => clampZ(l.z)),
      customdata: own.map((l) => [l.cpalLot, l.custLotNumber, l.productName ?? '—', l.z.toFixed(2)]),
      marker: { color: color[risk], symbol: RISK_META[risk].symbol, size: 11, line: { color: t.card, width: 1 } },
      hovertemplate:
        'Lot %{customdata[1]}<br>%{customdata[2]}<br>%{x} j avant péremption<br>z = %{customdata[3]}<extra>' +
        RISK_META[risk].label +
        '</extra>',
    }
  })

  const band = (y0: number, y1: number, fillcolor: string): Partial<Shape> => ({
    type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0, y1, fillcolor, opacity: 0.12, line: { width: 0 }, layer: 'below',
  })
  const line = (y: number): Partial<Shape> => ({
    type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: y, y1: y, line: { color: t.axis, width: 1, dash: 'dot' },
  })

  const layout: Partial<Layout> = {
    ...t.layout,
    hovermode: 'closest',
    margin: { l: 56, r: 12, t: 12, b: 48 },
    showlegend: true,
    legend: { orientation: 'h', y: -0.2, font: { color: t.foreground } },
    xaxis: { ...t.layout.xaxis, title: { text: 'Durée de vie restante (jours)' } },
    yaxis: { ...t.layout.yaxis, title: { text: 'Score de risque z' }, range: [-edge, edge] },
    shapes: [band(1, edge, t.danger), band(0, 1, t.warning), band(-edge, 0, t.success), line(0), line(1)],
  }

  return (
    <Plot
      label={`Quadrant de risque : ${lots.length} lot(s) selon la durée de vie restante et le score z`}
      className="h-80 w-full"
      data={traces}
      layout={layout}
      onClick={(e) => {
        const id = e.points[0]?.customdata?.[0]
        if (typeof id === 'string') onSelect(id)
      }}
    />
  )
}
