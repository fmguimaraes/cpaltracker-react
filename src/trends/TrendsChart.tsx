import { useEffect, useRef, useState } from 'react'
import type { Annotations, Data, Layout, Shape } from 'plotly.js'
import type { TrendsLot, TrendsRisk } from '../api/trends'
import { Plot } from '@/ui/charts/plot'
import { useChartTheme } from '@/ui/charts/use-chart-theme'
import {
  QUADRANT_SPLIT_DAYS,
  RISK_META,
  RISK_ORDER,
  Y_FLOOR,
  Y_TOP,
  clipOf,
  formatExpiry,
  formatNumber,
  formatRatio,
  formatZ,
  xMax,
  yDomain,
} from './trendsData'
import { labelWidth, placeLabels, type Box } from './trendsLabels'

const MARGIN = { l: 48, r: 16, t: 24, b: 44 }
const Y_PAD = 0.35
const MIN_D = 12
const MAX_D = 32

export interface TrendsChartProps {
  /** Placed lots only (insufficient-history lots are filtered out by the caller). */
  lots: TrendsLot[]
  riskFilter: TrendsRisk | null
  selected: string | null
  /** Lot hovered in the table: ringed on the chart. */
  hovered: string | null
  onHover: (cpalLot: string | null) => void
  onSelect: (cpalLot: string) => void
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

function tooltip(l: TrendsLot) {
  const ratio = l.velocityRatio
  return [
    `<b>Lot ${l.custLotNumber}</b>`,
    l.productName ?? '',
    `Péremption ${formatExpiry(l.expiryDate)} · ${formatNumber(l.daysToExpiry, 0)} j`,
    `Solde ${formatNumber(l.balanceKg)} kg`,
    `Vitesse ${formatNumber(l.referenceVelocity)} → ${formatNumber(l.requiredVelocity)} kg/sem.${ratio === null ? '' : ` (${formatRatio(ratio)})`}`,
    `z = ${formatZ(l.z)} · ${RISK_META[l.risk].label}`,
  ]
    .filter(Boolean)
    .join('<br>')
}

/**
 * KAN-256 — risk quadrant (Plotly): x = days to expiry, y = stored z. Bands and dashed lines at z = 0 and 1,
 * zone labels on the right edge, z outside the domain drawn on the edge as ▲/▼ with its real value.
 */
export function TrendsChart({ lots, riskFilter, selected, hovered, onHover, onSelect }: TrendsChartProps) {
  const t = useChartTheme()
  const [ref, size] = useSize<HTMLDivElement>()
  const color: Record<TrendsRisk, string> = { eleve: t.danger, moyen: t.warning, faible: t.success }

  const domain = yDomain(lots.map((l) => l.z))
  const xr: [number, number] = [0, xMax(lots.map((l) => l.daysToExpiry))]
  const yr: [number, number] = [domain[0] - Y_PAD, domain[1] + Y_PAD]
  const maxBalance = Math.max(1, ...lots.map((l) => l.balanceKg))

  const points = lots.map((l) => {
    const clip = clipOf(l.z, domain)
    const y = clip === 'above' ? domain[1] : clip === 'below' ? domain[0] : l.z
    const d = MIN_D + (MAX_D - MIN_D) * Math.sqrt(Math.max(0, l.balanceKg) / maxBalance)
    const label = clip ? `${l.custLotNumber} · z ${formatNumber(l.z)}` : l.custLotNumber
    return { lot: l, x: Math.max(xr[0], l.daysToExpiry), y, clip, d, label }
  })

  const W = Math.max(0, size.width - MARGIN.l - MARGIN.r)
  const H = Math.max(0, size.height - MARGIN.t - MARGIN.b)
  const px = (x: number) => ((x - xr[0]) / (xr[1] - xr[0])) * W
  const py = (y: number) => ((yr[1] - y) / (yr[1] - yr[0])) * H

  const zoneLabels: { risk: TrendsRisk; y: number; hint: string }[] = [
    { risk: 'eleve', y: Y_TOP, hint: 'z > 1 · ◆ · ▲ si z > 3 (valeur réelle dans l’étiquette)' },
    { risk: 'moyen', y: 1, hint: '0 < z ≤ 1 · ■' },
    { risk: 'faible', y: 0, hint: `z ≤ 0 · ● · ▼ si z < ${formatNumber(Y_FLOOR, 0)} (valeur réelle dans l’étiquette)` },
  ]
  const obstacles: Box[] = [
    ...zoneLabels.map((z) => {
      const w = labelWidth(RISK_META[z.risk].label) + 8
      return { x0: W - w - 6, y0: py(z.y), x1: W, y1: py(z.y) + 16 }
    }),
    { x0: px(QUADRANT_SPLIT_DAYS), y0: H - 16, x1: px(QUADRANT_SPLIT_DAYS) + 30, y1: H },
  ]
  const placements =
    W > 0 && H > 0
      ? placeLabels(
          points.map((p) => ({
            id: p.lot.cpalLot,
            text: p.label,
            cx: px(p.x),
            cy: py(p.y),
            r: p.d / 2,
            required: p.lot.risk !== 'faible',
          })),
          { x0: 0, y0: -MARGIN.t + 2, x1: W, y1: H },
          obstacles,
        )
      : new Map()

  const dim = (l: TrendsLot) => riskFilter !== null && l.risk !== riskFilter

  const traces: Data[] = RISK_ORDER.map((risk) => {
    const own = points.filter((p) => p.lot.risk === risk)
    return {
      type: 'scatter',
      mode: 'markers',
      name: RISK_META[risk].label,
      showlegend: false,
      cliponaxis: false,
      x: own.map((p) => p.x),
      y: own.map((p) => p.y),
      customdata: own.map((p) => p.lot.cpalLot),
      hovertext: own.map((p) => tooltip(p.lot)),
      hovertemplate: '%{hovertext}<extra></extra>',
      marker: {
        color: color[risk],
        symbol: own.map((p) => (p.clip === 'above' ? 'triangle-up' : p.clip === 'below' ? 'triangle-down' : RISK_META[risk].symbol)),
        size: own.map((p) => p.d),
        opacity: own.map((p) => (dim(p.lot) ? 0.18 : 0.9)),
        line: { color: t.card, width: 1 },
      },
    }
  })

  const ringed = points.filter((p) => p.lot.cpalLot === selected || p.lot.cpalLot === hovered)
  traces.push({
    type: 'scatter',
    mode: 'markers',
    showlegend: false,
    cliponaxis: false,
    hoverinfo: 'skip',
    x: ringed.map((p) => p.x),
    y: ringed.map((p) => p.y),
    marker: {
      symbol: 'circle-open',
      size: ringed.map((p) => p.d + 10),
      color: t.primary,
      line: { color: t.primary, width: ringed.map((p) => (p.lot.cpalLot === selected ? 3 : 1.5)) },
    },
  })

  const band = (y0: number, y1: number, fillcolor: string): Partial<Shape> => ({
    type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0, y1, fillcolor, opacity: 0.08, line: { width: 0 }, layer: 'below',
  })
  const hline = (y: number): Partial<Shape> => ({
    type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: y, y1: y, line: { color: t.axis, width: 1, dash: 'dash' }, layer: 'below',
  })

  const annotations: Partial<Annotations>[] = [
    ...zoneLabels.map(
      (z): Partial<Annotations> => ({
        xref: 'paper', x: 1, xanchor: 'right', xshift: -6, yref: 'y', y: z.y, yanchor: 'top', yshift: -2, showarrow: false,
        text: `<b>${RISK_META[z.risk].label}</b>`,
        font: { color: color[z.risk], size: 11 },
        hovertext: `${RISK_META[z.risk].label} : ${z.hint}`,
        hoverlabel: { bgcolor: t.card, font: { color: t.foreground } },
      }),
    ),
    {
      xref: 'x', x: QUADRANT_SPLIT_DAYS, xanchor: 'left', xshift: 3, yref: 'paper', y: 0, yanchor: 'bottom', showarrow: false,
      text: `${QUADRANT_SPLIT_DAYS} j`, font: { color: t.axis, size: 10 },
    },
    ...points
      .filter((p) => placements.has(p.lot.cpalLot))
      .map((p): Partial<Annotations> => {
        const at = placements.get(p.lot.cpalLot)!
        return {
          xref: 'x', x: p.x, yref: 'y', y: p.y, xanchor: 'center', yanchor: 'middle', xshift: at.dx, yshift: -at.dy, showarrow: false,
          text: `<b>${p.label}</b>`,
          font: { color: t.foreground, size: 11 },
          opacity: dim(p.lot) ? 0.3 : 1,
        }
      }),
  ]

  const ticks: number[] = []
  for (let v = domain[0]; v <= domain[1]; v++) ticks.push(v)

  const layout: Partial<Layout> = {
    ...t.layout,
    separators: ', ',
    hovermode: 'closest',
    margin: MARGIN,
    showlegend: false,
    xaxis: {
      ...t.layout.xaxis, range: xr, dtick: 30, tick0: 0, showgrid: false, zeroline: false,
      title: { text: 'Jours avant péremption', standoff: 8 },
    },
    yaxis: {
      ...t.layout.yaxis, range: yr, tickvals: ticks, showgrid: false, zeroline: false,
      title: { text: 'Score de risque (z)', standoff: 6 },
    },
    shapes: [
      band(1, yr[1], t.danger), band(0, 1, t.warning), band(yr[0], 0, t.success), hline(0), hline(1),
      { type: 'line', xref: 'x', x0: QUADRANT_SPLIT_DAYS, x1: QUADRANT_SPLIT_DAYS, yref: 'paper', y0: 0, y1: 1, line: { color: t.axis, width: 1, dash: 'dash' }, layer: 'below' },
    ],
    annotations,
  }

  return (
    <div ref={ref} className="relative h-full w-full" data-testid="trends-chart">
      <Plot
        label={`Quadrant de risque : ${lots.length} lot(s) selon les jours avant péremption et le score z`}
        className="h-full w-full"
        data={traces}
        layout={layout}
        onHover={(e) => {
          const id = e.points[0]?.customdata
          if (typeof id === 'string') onHover(id)
        }}
        onUnhover={() => onHover(null)}
        onClick={(e) => {
          const id = e.points[0]?.customdata
          if (typeof id === 'string') onSelect(id)
        }}
      />
      <span className="pointer-events-none absolute bottom-1 right-4 text-xs text-muted-foreground">taille = solde</span>
    </div>
  )
}
