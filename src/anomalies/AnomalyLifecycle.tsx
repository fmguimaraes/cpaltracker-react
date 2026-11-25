import type { AnomalyDetail, AnomalyStatus } from '../api/anomalies'
import { formatAbsolute, formatLocalIso, parseUtc } from './anomalyCard'
import { cn } from '@/lib/utils'

/** The lifecycle, in order, with the step names of the detail view (the two closed statuses kept apart). */
const STEPS: { status: AnomalyStatus; label: string }[] = [
  { status: 'detectee', label: 'Détectée' },
  { status: 'en_cours', label: 'En cours' },
  { status: 'fermee', label: 'Clôture provisoire' },
  { status: 'cloturee', label: 'Clôturée' },
]

interface Reached {
  at: Date
  by: string
}

/**
 * When each step up to the current one was (last) reached: the detection itself, then the latest transition
 * into that status. Steps after the current one are pending, even if reached before a reopening.
 */
export function lifecycleReached(detail: Pick<AnomalyDetail, 'status' | 'detectedAt' | 'history'>): (Reached | null)[] {
  const currentIndex = STEPS.findIndex((step) => step.status === detail.status)
  return STEPS.map((step, index) => {
    if (index > currentIndex) return null
    if (step.status === 'detectee') {
      const at = parseUtc(detail.detectedAt)
      return at ? { at, by: 'Système' } : null
    }
    // The server sends the history newest first: the first match is the latest entry into the step.
    const entry = detail.history.find((item) => item.to === step.status && item.from !== item.to)
    const at = entry ? parseUtc(entry.at) : null
    return entry && at ? { at, by: entry.by.name ?? 'Autre organisation' } : null
  })
}

/**
 * Owner 2026-11-25: the anomaly's lifecycle as a horizontal step bar under the drawer header — each step
 * reached shows when (its author in the tooltip), the current one is ringed, the next ones are hollow.
 */
export function AnomalyLifecycle({ detail, now }: { detail: AnomalyDetail; now: Date }) {
  const currentIndex = STEPS.findIndex((step) => step.status === detail.status)
  const reached = lifecycleReached(detail)
  return (
    <ol className="grid grid-cols-4 pt-3" aria-label="Cycle de vie" data-testid="anomaly-lifecycle">
      {STEPS.map((step, index) => {
        const done = index <= currentIndex
        const current = index === currentIndex
        const when = reached[index]
        return (
          <li
            key={step.status}
            className="relative flex min-w-0 flex-col items-center gap-1 px-1 text-center"
            aria-current={current ? 'step' : undefined}
            data-testid={`anomaly-lifecycle-${step.status}`}
            data-state={current ? 'current' : done ? 'done' : 'pending'}
          >
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn('absolute top-1.25 left-1/2 h-0.5 w-full', index < currentIndex ? 'bg-signal' : 'bg-border')}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative size-3 shrink-0 rounded-full border-2',
                done ? 'border-signal bg-signal' : 'border-border bg-card',
                current && 'ring-4 ring-signal/25',
              )}
            />
            <span className={cn('text-xs leading-tight', current ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted-foreground')}>
              {step.label}
            </span>
            {when && (
              <time
                dateTime={formatLocalIso(when.at)}
                title={`${formatLocalIso(when.at)} · ${when.by}`}
                className="text-xs leading-tight text-muted-foreground tabular-nums"
              >
                {formatAbsolute(when.at, now)}
              </time>
            )}
          </li>
        )
      })}
    </ol>
  )
}
