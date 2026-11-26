import { Skeleton } from '@/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * KAN-344 (FR17/FR21/FR23): a stack of row-shaped `Skeleton`s for a list that is loading. The region is a
 * `role="status"` with `sr-only` French text, and goes away with the skeleton once content shows.
 * `rowClassName` shapes a row (default: a two-line list card); `rows` is how many to draw.
 */
export function SkeletonRows({
  label,
  rows = 4,
  rowClassName = 'h-16',
  className,
  testId,
  surface,
}: {
  /** The announced text, e.g. "Chargement des anomalies…". */
  label: string
  rows?: number
  rowClassName?: string
  className?: string
  testId?: string
  /** `card` when drawn on a card surface (the Pulse drawer): see `Skeleton`. */
  surface?: 'page' | 'card'
}) {
  return (
    <div role="status" data-testid={testId} className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} surface={surface} className={cn('w-full', rowClassName)} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
