import type { AnomalyStatus } from '../api/anomalies'

export const STATUS_LABEL: Record<AnomalyStatus, string> = {
  detectee: 'Détectée',
  en_cours: 'En cours',
  fermee: 'Fermée',
  cloturee: 'Clôturée',
}

export const STATUS_TONE: Record<AnomalyStatus, 'danger' | 'warning' | 'neutral' | 'success'> = {
  detectee: 'danger',
  en_cours: 'warning',
  fermee: 'neutral',
  cloturee: 'success',
}

/** The list's status filter: the default hides `cloturee` (the server default when no status is sent). */
export type StatusFilter = 'open' | 'all' | AnomalyStatus

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Non clôturées' },
  { value: 'all', label: 'Toutes' },
  { value: 'detectee', label: STATUS_LABEL.detectee },
  { value: 'en_cours', label: STATUS_LABEL.en_cours },
  { value: 'fermee', label: STATUS_LABEL.fermee },
  { value: 'cloturee', label: STATUS_LABEL.cloturee },
]

const ALL_STATUSES: AnomalyStatus[] = ['detectee', 'en_cours', 'fermee', 'cloturee']

/** Statuses to request, or undefined to let the server apply its default. */
export function statusesForFilter(filter: StatusFilter): AnomalyStatus[] | undefined {
  if (filter === 'open') return undefined
  return filter === 'all' ? ALL_STATUSES : [filter]
}

/** "19,5 °C" — the value as stored, with its unit; "—" when absent. */
export function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—'
  const text = String(value).replace('.', ',')
  if (unit === '') return text
  return unit === '°' ? `${text}${unit}` : `${text} ${unit}`
}

/** "2026-11-05 21:57 UTC" from the API's UTC wall-clock text. */
export function formatMoment(text: string): string {
  return `${text.slice(0, 16)} UTC`
}

/** Coordinates as text, e.g. "46.205234, 5.225304". */
export function formatCoordinates(point: { lat: number; lng: number }): string {
  return `${point.lat}, ${point.lng}`
}

export const COMMENT_MAX_LENGTH = 2000

/** The button label of a transition; reopening a closed-for-review anomaly is "Rouvrir". */
export function actionLabel(from: AnomalyStatus, to: AnomalyStatus): string {
  if (to === 'fermee') return 'Fermer'
  if (to === 'cloturee') return 'Clôturer'
  return from === 'fermee' ? 'Rouvrir' : 'Prendre en charge'
}

/** Inline error for the comment, or null when it may be sent. */
export function commentError(commentRequired: boolean, comment: string): string | null {
  if (commentRequired && comment.trim() === '') return 'Un résumé des actions est obligatoire pour fermer.'
  if (comment.length > COMMENT_MAX_LENGTH) return `Le commentaire ne peut pas dépasser ${COMMENT_MAX_LENGTH} caractères.`
  return null
}

export const READ_ONLY_NOTE: Record<string, string> = {
  cloturee: 'Anomalie clôturée',
  closing_right_required: 'La clôture est réservée aux responsables',
  std_scope: 'Consultation seule sur un contrat partagé',
}
