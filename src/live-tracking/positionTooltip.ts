import type { Position } from '../api/positions'
import { formatAbsolute, formatMeasure, formatRelative } from '../anomalies/anomalyCard'

/**
 * KAN-160 (FR7), reworked by Pulse layout v2 §4 — the content of a marker's detail card, for Pulse and
 * Suivi en direct alike (local time, fr-FR numbers: strictly better than the former UTC/raw-number list):
 *
 *   title    the chip ID (positions carry no pallet name)
 *   when     "15 nov. 12:00 · il y a 9 j" (browser time zone)
 *   place    "49,5000, 3,0000" (4 decimals, fr-FR; no place names: there is no geocoding source)
 *   metrics  a compact 2 × 2 grid: temperature, humidity, acceleration, weight
 *
 * Every line only when its data exists. "Température MPU" is no longer shown (a support value). Pure and
 * text-only (NFR6/NFR8): the card renders these strings as text content.
 */
export type TooltipMetricKey = 'temperature' | 'humidity' | 'acceleration' | 'weight'

export interface TooltipMetric {
  key: TooltipMetricKey
  /** Accessible name of the metric (the grid shows an icon). */
  label: string
  value: string
}

export interface PositionCard {
  title: string
  when: string | null
  place: string | null
  metrics: TooltipMetric[]
}

const COORDINATE = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4, useGrouping: false })

/** "49,5000, 3,0000". */
export function formatPlace(latitude: number, longitude: number): string {
  return `${COORDINATE.format(latitude)}, ${COORDINATE.format(longitude)}`
}

function metric(key: TooltipMetricKey, label: string, value: number | null, unit: string): TooltipMetric[] {
  return value === null || Number.isNaN(value) ? [] : [{ key, label, value: formatMeasure(value, unit) }]
}

export function formatPositionCard(position: Position, now: Date = new Date()): PositionCard {
  const date = position.timestamp ? new Date(position.timestamp) : null
  const validDate = date && !Number.isNaN(date.getTime()) ? date : null
  return {
    title: position.chipId,
    when: validDate ? `${formatAbsolute(validDate, now)} · ${formatRelative(validDate, now)}` : null,
    place: position.latitude !== null && position.longitude !== null ? formatPlace(position.latitude, position.longitude) : null,
    metrics: [
      ...metric('temperature', 'Température', position.ambientTemperature, '°C'),
      ...metric('humidity', 'Humidité', position.humidity, '%HR'),
      ...metric('acceleration', 'Accélération', position.accelG, 'g'),
      ...metric('weight', 'Poids', position.mass, 'kg'),
    ],
  }
}
