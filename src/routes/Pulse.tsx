import { useCallback, useMemo, useState } from 'react'
import { Alert } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { PageHeader } from '@/ui/patterns/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'
import { fetchPulse } from '../api/pulse'
import type { Position } from '../api/positions'
import { useContracts } from '../contracts/ContractContext'
import { ContractPositions } from '../live-tracking/ContractPositions'

const ALL_LOTS = 'all'

/**
 * KAN-272 (Pulse v1) — the Live Tracking page (same `ContractPositions` map, fleet panel and weight
 * colours) fed by `contracts/pulse.php`, so each marker tooltip also shows its lot, plus a lot filter
 * that narrows the map to that lot's devices. The contract comes from the global `ContractProvider`.
 */
export function Pulse() {
  const { contracts, loadState: state, selectedId, accessError, rejectContract } = useContracts()
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  const [loaded, setLoaded] = useState<Position[]>([])
  const [lotChoice, setLotChoice] = useState(ALL_LOTS)

  // Stable identity (ContractPositions re-fetches when it changes); mirrors the snapshot for the lot list.
  const load = useCallback(async (contractId: number) => {
    const positions = await fetchPulse(contractId)
    setLoaded(positions)
    return positions
  }, [])

  const lots = useMemo(() => {
    const byLot = new Map<string, string>()
    for (const { lot } of loaded) {
      if (!lot || byLot.has(lot.cpalLot)) continue
      const name = [lot.custLotNumber ?? lot.cpalLot, lot.productName].filter(Boolean).join(' — ')
      byLot.set(lot.cpalLot, lot.status === 'closed' ? `${name} (clôturé)` : name)
    }
    return [...byLot].sort((a, b) => a[1].localeCompare(b[1]))
  }, [loaded])

  // A lot that vanished (contract change, refresh) falls back to "all" instead of an empty map.
  const lot = lots.some(([id]) => id === lotChoice) ? lotChoice : ALL_LOTS
  const filter = useMemo(
    () => (lot === ALL_LOTS ? undefined : (p: Position) => p.lot?.cpalLot === lot),
    [lot],
  )

  return (
    <div className="flex flex-col page-fill-height max-md:pb-6" data-testid="pulse">
      <PageHeader
        title="Pulse"
        className="shrink-0 [&_h1]:sr-only"
        actions={
          <>
            {lots.length > 0 && (
              <Select value={lot} onValueChange={setLotChoice}>
                <SelectTrigger size="sm" data-testid="pulse-lot-filter" aria-label="Filtrer par lot client">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={ALL_LOTS}>Tous les lots</SelectItem>
                  {lots.map(([id, label]) => (
                    <SelectItem key={id} value={id} data-testid={`pulse-lot-option-${id}`}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div ref={setActionsSlot} className="flex flex-wrap items-center gap-3" />
          </>
        }
      />

      <div className="flex flex-col gap-4 shrink-0 px-4 py-4 md:px-6 empty:hidden">
        {state === 'loading' && (
          <div data-testid="pulse-loading" role="status">
            <Skeleton className="h-9 w-64" />
            <span className="sr-only">Chargement des contrats…</span>
          </div>
        )}

        {state === 'error' && (
          <Alert variant="danger" data-testid="pulse-error">
            Impossible de charger vos contrats. Réessayez plus tard.
          </Alert>
        )}

        {state === 'loaded' && contracts.length === 0 && (
          <Empty data-testid="pulse-empty">
            <EmptyHeader>
              <EmptyDescription>Aucun contrat n'est associé à votre compte.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {accessError && (
          <Alert variant="danger" data-testid="contract-access-error">
            {accessError}
          </Alert>
        )}
      </div>

      {selectedId !== null && (
        <ContractPositions
          contractId={selectedId}
          onUnauthorized={rejectContract}
          actionsSlot={actionsSlot}
          load={load}
          filter={filter}
        />
      )}
    </div>
  )
}
