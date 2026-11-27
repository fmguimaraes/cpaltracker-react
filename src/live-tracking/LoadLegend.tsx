import { STATUS_DOT } from '@/ui/map'
import { cn } from '@/lib/utils'
import { WEIGHT_OK_PERCENT, WEIGHT_WARNING_PERCENT } from './markerStyle'

/**
 * The scale's segments, empty → initial weight, on a 10-column grid: each spans its share of 0–100 %
 * (0–20, 20–50, 50–100: the `weightState` thresholds; change both together). Labels sit at each start.
 */
const SEGMENTS = [
  { status: 'alert', span: 'col-span-2', from: 0 },
  { status: 'warning', span: 'col-span-3', from: WEIGHT_WARNING_PERCENT },
  { status: 'ok', span: 'col-span-5', from: WEIGHT_OK_PERCENT },
] as const

/**
 * "Poids restant transporté": the marker state colours as a scale of the remaining weight, in % of the
 * pallet's initial weight (owner 2026-11-27; thresholds in `weightState`), plus the grey of a pallet with no
 * reading or no initial weight. `inline`: a plain section (e.g. a popover); otherwise a card of its own.
 */
export function LoadLegend({ className, inline = false }: { className?: string; inline?: boolean }) {
  return (
    <div
      data-testid="load-legend"
      className={cn(
        'flex flex-col gap-1.5',
        inline ? 'w-full' : 'w-64 rounded-lg border border-border bg-card px-3 py-2 shadow-overlay',
        className,
      )}
    >
      <p className={cn('text-xs font-semibold tracking-wide text-muted-foreground uppercase', !inline && 'whitespace-nowrap')}>
        Poids restant transporté
      </p>
      <div aria-hidden className="flex justify-between text-xs text-muted-foreground">
        <span>vide</span>
        <span>poids initial</span>
      </div>
      <div aria-hidden className="grid h-2 grid-cols-10 gap-0.5 overflow-hidden rounded-full">
        {SEGMENTS.map(({ status, span }) => (
          <span key={status} data-status={status} className={cn(STATUS_DOT[status], span)} />
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-10 gap-0.5 text-xs text-muted-foreground tabular-nums">
        {SEGMENTS.map(({ status, span, from }) => (
          <span key={status} className={cn(span, 'flex justify-between')}>
            <span>{from} %</span>
            {status === 'ok' && <span>100 %</span>}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
        <span aria-hidden className={cn(STATUS_DOT.offline, 'size-2.5 shrink-0 rounded-full')} />
        sans mesure ou sans poids initial
      </div>
      <p className="sr-only">
        Vert : au moins {WEIGHT_OK_PERCENT} % du poids initial ; orange : de {WEIGHT_WARNING_PERCENT} à{' '}
        {WEIGHT_OK_PERCENT} % ; rouge : moins de {WEIGHT_WARNING_PERCENT} % ; gris : sans mesure ou sans poids
        initial.
      </p>
    </div>
  )
}
