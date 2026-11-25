import { LOAD_DOT } from '@/ui/map'
import { cn } from '@/lib/utils'

/**
 * "Poids restant transporté": the marker colour ramp, empty → full load. `inline`: a plain section (the Pulse
 * map's layers popover); otherwise a card of its own.
 */
export function LoadLegend({ className, inline = false }: { className?: string; inline?: boolean }) {
  return (
    <div
      data-testid="load-legend"
      className={cn(
        'flex flex-col gap-1.5',
        inline ? 'w-full' : 'w-max rounded-lg border border-border bg-card px-3 py-2 shadow-overlay',
        className,
      )}
    >
      <p className={cn('text-xs font-semibold tracking-wide text-muted-foreground uppercase', !inline && 'whitespace-nowrap')}>
        Poids restant transporté
      </p>
      <div aria-hidden className="grid h-2 grid-cols-5 gap-0.5 overflow-hidden rounded-full">
        {LOAD_DOT.map((tone) => (
          <span key={tone} className={tone} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>vide</span>
        <span>charge pleine</span>
      </div>
    </div>
  )
}
