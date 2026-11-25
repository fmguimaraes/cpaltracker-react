import type { AnomalyStatus } from '../api/anomalies'
import { STATUS_DISPLAY } from './anomalyFormat'
import { Badge } from '@/ui/badge'
import { cn } from '@/lib/utils'

/**
 * An anomaly status pill (`STATUS_DISPLAY`). `qualified` (detail view) adds the status's muted qualifier
 * after the pill, e.g. "Clôturée provisoire" for `fermee`; the lists show the bare pill.
 */
export function StatusPill({
  status,
  qualified = false,
  className,
  'data-testid': testId,
}: {
  status: AnomalyStatus
  qualified?: boolean
  className?: string
  'data-testid'?: string
}) {
  const { label, tone, qualifier } = STATUS_DISPLAY[status]
  const pill = (
    <Badge variant={tone} className={cn(!(qualified && qualifier) && className)} data-testid={testId} data-status={status}>
      {label}
    </Badge>
  )
  if (!qualified || !qualifier) return pill
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      {pill}
      <span className="text-xs text-muted-foreground" data-testid={testId && `${testId}-qualifier`}>
        {qualifier}
      </span>
    </span>
  )
}
