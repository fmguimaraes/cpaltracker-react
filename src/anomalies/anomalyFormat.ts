import type { AnomalyStatus } from '../api/anomalies'

/** The list's status tabs. `open` = À traiter + En cours; `closed` = both closed statuses. */
export type StatusFilter = 'open' | 'closed' | 'all'

export type StatusTone = 'danger' | 'warning' | 'neutral' | 'success'

/** One status as the UI shows it: pill label and tone, its list tab, and an optional muted qualifier. */
export interface StatusDisplay {
  label: string
  tone: StatusTone
  /** Shown in muted text after the pill where the two closed statuses must be told apart (detail view). */
  qualifier: string | null
  tab: Exclude<StatusFilter, 'all'>
}

/**
 * Owner redesign 2026-11-25: the shared status mapping. The UI vocabulary is "À traiter" (backend
 * `detectee`), "En cours" and "Clôturée". The backend keeps two closed statuses: `fermee` (closed for
 * review, may still be reopened or closed for good by a manager) is "Clôturée (provisoire)": the Clôturée
 * pill plus a muted "provisoire" qualifier, in the Clôturées tab; `cloturee` (final) is plain "Clôturée".
 */
export const STATUS_DISPLAY: Record<AnomalyStatus, StatusDisplay> = {
  detectee: { label: 'À traiter', tone: 'danger', qualifier: null, tab: 'open' },
  en_cours: { label: 'En cours', tone: 'warning', qualifier: null, tab: 'open' },
  fermee: { label: 'Clôturée', tone: 'neutral', qualifier: 'provisoire', tab: 'closed' },
  cloturee: { label: 'Clôturée', tone: 'neutral', qualifier: null, tab: 'closed' },
}

const ALL_STATUSES: AnomalyStatus[] = ['detectee', 'en_cours', 'fermee', 'cloturee']

function byStatus<T>(pick: (display: StatusDisplay) => T): Record<AnomalyStatus, T> {
  return Object.fromEntries(ALL_STATUSES.map((status) => [status, pick(STATUS_DISPLAY[status])])) as Record<AnomalyStatus, T>
}

/** The pill label (lists, chart tooltips): both closed statuses read "Clôturée". */
export const STATUS_LABEL: Record<AnomalyStatus, string> = byStatus((display) => display.label)

/** The detail view's history text, where the two closed statuses must stay distinguishable. */
export const DETAIL_STATUS_LABEL: Record<AnomalyStatus, string> = byStatus(({ label, qualifier }) =>
  qualifier ? `${label} (${qualifier})` : label,
)

/** Pill tones: red to handle, amber in progress, grey closed. */
export const STATUS_TONE: Record<AnomalyStatus, StatusTone> = byStatus((display) => display.tone)

export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string; empty: string }[] = [
  { value: 'open', label: 'Ouvertes', empty: 'Aucune anomalie ouverte' },
  { value: 'closed', label: 'Clôturées', empty: 'Aucune anomalie clôturée' },
  { value: 'all', label: 'Toutes', empty: 'Aucune anomalie' },
]

/**
 * The statuses a tab stands for — always explicit. "Non clôturées" used to send none and rely on the
 * server default, which only excludes `cloturee`, so `fermee` rows (shown as "Clôturée") leaked through.
 */
export function statusesForFilter(filter: StatusFilter): AnomalyStatus[] {
  if (filter === 'all') return ALL_STATUSES
  return ALL_STATUSES.filter((status) => STATUS_DISPLAY[status].tab === filter)
}

/** "+3 h", "+6 j": a delay of at least an hour, floored to the hour below a day, to the day above. */
export function formatDelay(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000)
  return hours < 24 ? `+${hours}\u00a0h` : `+${Math.floor(hours / 24)}\u00a0j`
}

export const COMMENT_MAX_LENGTH = 2000

/**
 * The button label of a transition, in the "Clôturée" vocabulary: closing an anomaly in progress is
 * "Clôturer", the manager's final step is "Clôturer définitivement", reopening is "Rouvrir".
 */
export function actionLabel(from: AnomalyStatus, to: AnomalyStatus): string {
  if (to === 'fermee') return 'Clôturer'
  if (to === 'cloturee') return 'Clôturer définitivement'
  return from === 'fermee' ? 'Rouvrir' : 'Prendre en charge'
}

/**
 * The status action shown as the primary button, by target: taking charge (À traiter → En cours) or
 * reopening (Clôturée provisoire → En cours) first, then closing (En cours → Clôturée provisoire), then the
 * manager's final closing, which is only primary when it is the one action left.
 */
const PRIMARY_RANK: Record<AnomalyStatus, number> = { en_cours: 0, fermee: 1, cloturee: 2, detectee: 3 }

/** The server's allowed transitions, primary first (`PRIMARY_RANK`); never computed here. */
export function rankTransitions<T extends { to: AnomalyStatus }>(transitions: T[]): T[] {
  return [...transitions].sort((a, b) => PRIMARY_RANK[a.to] - PRIMARY_RANK[b.to])
}

/** The comment's character counter shows only past 80 % of the limit (1 600 / 2 000). */
export const COMMENT_COUNTER_FROM = COMMENT_MAX_LENGTH * 0.8

/** Inline error for the comment, or null when it may be sent. */
export function commentError(commentRequired: boolean, comment: string): string | null {
  if (commentRequired && comment.trim() === '') return 'Un résumé des actions est obligatoire pour clôturer.'
  if (comment.length > COMMENT_MAX_LENGTH) return `Le commentaire ne peut pas dépasser ${COMMENT_MAX_LENGTH} caractères.`
  return null
}

export const READ_ONLY_NOTE: Record<string, string> = {
  cloturee: 'Anomalie clôturée',
  closing_right_required: 'La clôture est réservée aux responsables',
  std_scope: 'Consultation seule sur un contrat partagé',
}
