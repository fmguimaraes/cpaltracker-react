import { useEffect, useMemo, useState } from 'react'
import type { Layout } from 'plotly.js'

export type SeriesDash = 'solid' | 'dash' | 'dot' | 'dashdot' | 'longdash'
export type SeriesSymbol = 'circle' | 'square' | 'diamond' | 'triangle-up' | 'cross'

const DASHES: SeriesDash[] = ['solid', 'dash', 'dot', 'dashdot', 'longdash']
const SYMBOLS: SeriesSymbol[] = ['circle', 'square', 'diamond', 'triangle-up', 'cross']

/** Visual identity of series `i`. */
export interface SeriesStyle {
  /** Index into --chart-1..5 (i % 5). */
  colorIndex: number
  /** Palette pass (floor(i / 5)); 0 for the first five series. */
  cycle: number
  dash: SeriesDash
  symbol: SeriesSymbol
}

/**
 * More-than-five-series rule (K-7): colour cycles --chart-1..5; every further pass
 * changes the dash (lines) and the marker symbol, so series stay distinguishable
 * without relying on colour. Series 0-4 are solid circles. FleetMap markers use the
 * same index (`MapDevice.series`) and change swatch shape per cycle.
 */
export function seriesStyle(i: number): SeriesStyle {
  const cycle = Math.floor(i / 5)
  return { colorIndex: i % 5, cycle, dash: DASHES[cycle % DASHES.length], symbol: SYMBOLS[cycle % SYMBOLS.length] }
}

/** Resolved token colors for Plotly (it cannot read CSS variables). */
export interface ChartTheme {
  colors: string[] // --chart-1..5
  axis: string
  grid: string
  card: string
  foreground: string
  warning: string
  danger: string
  success: string
  fontSans: string
  fontSerif: string
  /** Style (colour, dash, symbol) of series i; see `seriesStyle`. */
  seriesStyle: (i: number) => SeriesStyle
  /** Plotly layout base: transparent, token font/grid, responsive. */
  layout: Partial<Layout>
}

/** Resolve a CSS custom property to a concrete color (handles var() chains and color-mix). */
function resolveColor(name: string): string {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  probe.style.display = 'none'
  document.documentElement.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return value
}

function readTheme(): ChartTheme {
  const root = getComputedStyle(document.documentElement)
  const fontSans = root.getPropertyValue('--font-sans').trim()
  const fontSerif = root.getPropertyValue('--font-serif').trim()
  const colors = [1, 2, 3, 4, 5].map((i) => resolveColor(`--chart-${i}`))
  const axis = resolveColor('--chart-axis')
  const grid = resolveColor('--chart-grid')
  const foreground = resolveColor('--foreground')
  const layout: Partial<Layout> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: fontSans, color: axis, size: 12 },
    colorway: colors,
    margin: { l: 40, r: 12, t: 12, b: 32 },
    autosize: true,
    hovermode: 'x unified',
    hoverlabel: { bgcolor: resolveColor('--card'), font: { color: foreground, family: fontSans }, bordercolor: grid },
    xaxis: { gridcolor: grid, linecolor: grid, zeroline: false, tickfont: { color: axis }, fixedrange: true },
    yaxis: { gridcolor: grid, linecolor: grid, zeroline: false, tickfont: { color: axis }, fixedrange: true },
    legend: { font: { color: foreground } },
  }
  return {
    colors,
    axis,
    grid,
    card: resolveColor('--card'),
    foreground,
    warning: resolveColor('--warning'),
    danger: resolveColor('--danger'),
    success: resolveColor('--success') || colors[2],
    fontSans,
    fontSerif,
    seriesStyle,
    layout,
  }
}

/** Chart theme from CSS tokens; recomputes when <html data-theme> changes. */
export function useChartTheme(): ChartTheme {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    return () => observer.disconnect()
  }, [])
  return useMemo(readTheme, [version])
}

/** Shared Plotly config: no modebar clutter, responsive. */
export const chartConfig = { displayModeBar: false, responsive: true, displaylogo: false } as const
