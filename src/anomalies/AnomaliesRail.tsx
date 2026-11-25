import { useCallback } from 'react'
import { TriangleAlert } from 'lucide-react'
import { fetchAnomalies } from '../api/anomalies'
import { statusesForFilter } from './anomalyFormat'
import { useLoad } from './useLoad'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'

/**
 * Owner redesign 2026-11-25 (§9): the collapsed anomalies drawer, a narrow rail with an alert icon and
 * the count of non-closed anomalies (same statuses as the "Ouvertes" tab, and the same map-viewport filter
 * as the list when `visibleChipIds` is set). Fetched on mount, so each collapse shows a fresh count.
 * Clicking it expands the drawer.
 */
export function AnomaliesRail({
  contractId,
  visibleChipIds,
  onExpand,
}: {
  contractId: number
  visibleChipIds?: ReadonlySet<string>
  onExpand: () => void
}) {
  const load = useCallback(() => fetchAnomalies(contractId, statusesForFilter('open')), [contractId])
  const { state } = useLoad(load)

  const count =
    state.status === 'ready'
      ? state.value.filter(
          (row) =>
            (row.status === 'detectee' || row.status === 'en_cours') &&
            (visibleChipIds === undefined || visibleChipIds.has(row.chipId)),
        ).length
      : null
  const label =
    count === null
      ? 'Afficher les anomalies'
      : `Afficher les anomalies (${count} non clôturée${count > 1 ? 's' : ''})`

  return (
    <Button
      variant="ghost"
      className="h-auto w-full flex-col gap-1 px-0 py-3"
      onClick={onExpand}
      aria-label={label}
      title={label}
      aria-expanded={false}
      data-testid="anomalies-rail"
    >
      <TriangleAlert className="size-5" aria-hidden />
      {count !== null && (
        <Badge variant={count > 0 ? 'danger' : 'neutral'} className="tabular-nums" data-testid="anomalies-rail-count">
          {count}
        </Badge>
      )}
    </Button>
  )
}
