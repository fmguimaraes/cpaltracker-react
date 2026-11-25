import { Activity, Droplet, Thermometer, Weight, type LucideIcon } from 'lucide-react'
import type { Position } from '../api/positions'
import { formatNumber } from '../anomalies/anomalyCard'
import { Button } from '@/ui/button'

interface RailMetric {
  key: string
  label: string
  icon: LucideIcon
  unit: string
  decimals: number
  value: (position: Position) => number | null
}

/* Same order and precision as the pallet drawer's charts (max 1 decimal; whole kilograms). */
const METRICS: RailMetric[] = [
  { key: 'temperature', label: 'Température', icon: Thermometer, unit: '°C', decimals: 1, value: (p) => p.ambientTemperature },
  { key: 'humidity', label: 'Humidité', icon: Droplet, unit: '%HR', decimals: 1, value: (p) => p.humidity },
  { key: 'accel', label: 'Accélération', icon: Activity, unit: 'g', decimals: 1, value: (p) => p.accelG },
  { key: 'mass', label: 'Poids', icon: Weight, unit: 'kg', decimals: 0, value: (p) => p.mass },
]

/**
 * Owner 2026-11-25: the collapsed drawer while a pallet is open shows that pallet's latest values (an icon
 * over each value, its unit below), not the anomaly count. Only the measures the pallet reports are listed.
 * Clicking it expands the drawer back on the pallet.
 */
export function PalletRail({ position, onExpand }: { position: Position; onExpand: () => void }) {
  const shown = METRICS.flatMap((metric) => {
    const value = metric.value(position)
    return value === null ? [] : [{ metric, text: formatNumber(value, metric.decimals) }]
  })
  const label = `Afficher la palette ${position.chipId}`

  return (
    <Button
      variant="ghost"
      className="h-auto w-full flex-col gap-3 px-0 py-3"
      onClick={onExpand}
      aria-label={label}
      title={label}
      aria-expanded={false}
      data-testid="pallet-rail"
    >
      {shown.map(({ metric, text }) => (
        <span
          key={metric.key}
          className="flex flex-col items-center gap-0.5 leading-none"
          data-testid={`pallet-rail-${metric.key}`}
        >
          <metric.icon className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-xs font-semibold tabular-nums text-foreground">{text}</span>
          <span className="text-xs text-muted-foreground">{metric.unit}</span>
          <span className="sr-only">{metric.label}</span>
        </span>
      ))}
    </Button>
  )
}
