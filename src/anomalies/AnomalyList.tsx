import { useCallback } from 'react'
import { fetchAnomalies } from '../api/anomalies'
import { formatMoment, formatValue, STATUS_LABEL, statusesForFilter, STATUS_TONE, type StatusFilter } from './anomalyFormat'
import { useLoad } from './useLoad'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

/** KAN-261 (FR4, FR5, FR8): the contract's anomalies as a table; a row opens the detail. */
export function AnomalyList({
  contractId,
  filter,
  onSelect,
}: {
  contractId: number
  filter: StatusFilter
  onSelect: (anomalyKey: string) => void
}) {
  const load = useCallback(() => fetchAnomalies(contractId, statusesForFilter(filter)), [contractId, filter])
  const { state, reload } = useLoad(load)

  if (state.status === 'loading') return <Skeleton className="h-48 w-full" data-testid="anomaly-list-loading" />

  if (state.status === 'error') {
    return (
      <Empty data-testid="anomaly-list-error">
        <EmptyHeader>
          <EmptyDescription>Impossible de charger les anomalies.</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={reload}>
          Réessayer
        </Button>
      </Empty>
    )
  }

  if (state.value.length === 0) {
    return (
      <Empty data-testid="anomaly-list-empty">
        <EmptyHeader>
          <EmptyDescription>Aucune anomalie pour ces critères</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Table data-testid="anomaly-list">
      <TableHeader>
        <TableRow>
          <TableHead>Statut</TableHead>
          <TableHead>Anomalie</TableHead>
          <TableHead>Valeur</TableHead>
          <TableHead>Device</TableHead>
          <TableHead>Lot client</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.value.map((row) => (
          <TableRow key={row.anomalyKey} data-testid={`anomaly-row-${row.anomalyKey}`}>
            <TableCell>
              <Badge variant={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
            </TableCell>
            <TableCell>
              <Button
                variant="link"
                className="h-auto p-0 text-left whitespace-normal"
                onClick={() => onSelect(row.anomalyKey)}
                data-testid={`anomaly-open-${row.anomalyKey}`}
              >
                {row.code} — {row.label}
              </Button>
            </TableCell>
            <TableCell>{formatValue(row.value, row.unit)}</TableCell>
            <TableCell>{row.chipId}</TableCell>
            <TableCell>{row.lot?.custLotNumber ?? '—'}</TableCell>
            <TableCell>{formatMoment(row.eventDate)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
