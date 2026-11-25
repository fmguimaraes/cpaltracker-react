import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { TrendsLot, TrendsRisk } from '../api/trends'

/** Display-only helpers: every calculation comes from the API (trends_logic.php). */

export const RISK_ORDER: TrendsRisk[] = ['eleve', 'moyen', 'faible']

/** Label, badge variant, icon (never colour alone) and Plotly marker symbol of each risk. */
export const RISK_META: Record<
  TrendsRisk,
  { label: string; variant: 'danger' | 'warning' | 'success'; icon: LucideIcon; symbol: 'diamond' | 'square' | 'circle'; glyph: string }
> = {
  eleve: { label: 'Élevé', variant: 'danger', icon: CircleAlert, symbol: 'diamond', glyph: '◆' },
  moyen: { label: 'Moyen', variant: 'warning', icon: TriangleAlert, symbol: 'square', glyph: '■' },
  faible: { label: 'Faible', variant: 'success', icon: CircleCheck, symbol: 'circle', glyph: '●' },
}

/** Y axis: fixed top, bottom follows the data down to Y_FLOOR; values outside are drawn on the edge (▲/▼). */
export const Y_TOP = 3
export const Y_FLOOR = -5
export const QUADRANT_SPLIT_DAYS = 30

export function yDomain(zs: number[]): [number, number] {
  const low = Math.min(-2, ...zs.map(Math.floor))
  return [Math.max(Y_FLOOR, low), Y_TOP]
}

/** Where z sits relative to the visible domain. */
export function clipOf(z: number, [min, max]: [number, number]): 'above' | 'below' | null {
  return z > max ? 'above' : z < min ? 'below' : null
}

/** x axis upper bound: the next multiple of 30 at or above the largest day count (at least 30). */
export function xMax(days: number[]): number {
  return Math.max(QUADRANT_SPLIT_DAYS, Math.ceil(Math.max(0, ...days) / 30) * 30)
}

/** dd/MM/yyyy from an ISO date. */
export function formatExpiry(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const formatters = new Map<string, Intl.NumberFormat>()
function nf(min: number, max: number, sign = false) {
  const key = `${min}-${max}-${sign}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max, signDisplay: sign ? 'exceptZero' : 'auto' })
    formatters.set(key, f)
  }
  return f
}

/** fr-FR: comma decimals, narrow no-break space thousands. */
export const formatNumber = (n: number, maxDecimals = 1) => nf(0, maxDecimals).format(n)
export const formatZ = (z: number) => nf(2, 2, true).format(z)
export const formatRatio = (r: number) => `×${nf(0, 1).format(r)}`

export type SortKey = 'lot' | 'expiry' | 'balance' | 'velocity' | 'z' | 'risk'
export interface SortState {
  key: SortKey
  desc: boolean
}
export const DEFAULT_SORT: SortState = { key: 'z', desc: true }

function sortValue(l: TrendsLot, key: SortKey): string | number | null {
  switch (key) {
    case 'lot':
      return l.custLotNumber
    case 'expiry':
      return l.expiryDate
    case 'balance':
      return l.balanceKg
    case 'velocity':
      return l.velocityRatio
    case 'z':
      return l.placed ? l.z : null
    case 'risk':
      return l.placed ? RISK_ORDER.length - RISK_ORDER.indexOf(l.risk) : null
  }
}

/** Sorted copy; lots without a value (insufficient history) always go last. */
export function sortLots(lots: TrendsLot[], { key, desc }: SortState): TrendsLot[] {
  return [...lots].sort((a, b) => {
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
    const cmp = typeof va === 'string' ? va.localeCompare(String(vb), 'fr') : va - (vb as number)
    return desc ? -cmp : cmp
  })
}
