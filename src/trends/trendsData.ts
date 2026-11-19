import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { TrendsRisk } from '../api/trends'

/** Displayed z is clamped to ±Z_CLAMP so an extreme score keeps the chart readable (spec FR28/EC19). */
export const Z_CLAMP = 5

export const RISK_ORDER: TrendsRisk[] = ['eleve', 'moyen', 'faible']

/** Label, badge variant, icon (never colour alone) and Plotly marker symbol of each risk. */
export const RISK_META: Record<
  TrendsRisk,
  { label: string; variant: 'danger' | 'warning' | 'success'; icon: LucideIcon; symbol: 'diamond' | 'square' | 'circle' }
> = {
  eleve: { label: 'Élevé', variant: 'danger', icon: CircleAlert, symbol: 'diamond' },
  moyen: { label: 'Moyen', variant: 'warning', icon: TriangleAlert, symbol: 'square' },
  faible: { label: 'Faible', variant: 'success', icon: CircleCheck, symbol: 'circle' },
}

export function clampZ(z: number): number {
  return Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z))
}

const DAY_MS = 86_400_000

/** Whole days from `today` (local calendar day) to the ISO expiry date; negative once expired. */
export function daysToExpiry(expiryIso: string, today: Date = new Date()): number {
  const [y, m, d] = expiryIso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS)
}

/** dd/MM/yyyy from an ISO date. */
export function formatExpiry(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const NUMBER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
export const formatNumber = (n: number) => NUMBER.format(n)
