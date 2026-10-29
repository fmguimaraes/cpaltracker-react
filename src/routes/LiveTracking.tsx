import { useEffect, useState } from 'react'
import { fetchContracts, type Contract } from '../api/contracts'
import { Alert } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { PageHeader } from '@/ui/patterns/page-header'
import { Skeleton } from '@/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'
import { ContractMessage } from '../live-tracking/ContractMessage'
import { ContractPositions } from '../live-tracking/ContractPositions'
import { GlobalMessage } from '../live-tracking/GlobalMessage'
import { HistoryDashboardLink } from '../live-tracking/HistoryDashboardLink'

type LoadState = 'loading' | 'loaded' | 'error'

/**
 * KAN-158 (FR1/FR2) — Live Tracking's entry gate and contract selector.
 * FR1's auth gate is `RequireAuth` (App.tsx wraps this route in it, same as
 * every other protected route) — this component only handles FR2: fetching
 * and rendering the contract list `/api/v1` already scoped server-side.
 *
 * FR2/AC: never branch on the account's own role to decide what to show —
 * a contract's `clientName` field being present at all (admin-only, per
 * `contracts.ts`'s doc comment) IS the authorization signal. This component
 * never reads `account.role`.
 *
 * Map rendering itself (FR3-FR7) is `ContractPositions`/`PositionsMap`
 * (KAN-160) — this component only tracks which contract is selected and
 * mounts that child, `ContractMessage`, and `HistoryDashboardLink` when it
 * is. `GlobalMessage` (KAN-165, FR13) isn't gated on a selection — it's
 * shown for the whole visit.
 *
 * KAN-171 moved `ClientLogo` (previously mounted here) into the new shared
 * `AppChrome` (`App.tsx`), which now wraps this route — see `AppChrome`'s
 * own doc comment for why. The heading below uses the kit `PageHeader` (FR7/FR8)
 * and the contract choice a `ToggleGroup` (single, radio semantics).
 * FR8: PAT-SPLIT — the refresh action of `ContractPositions` is portalled into
 * the header's actions slot.
 *
 * KAN-168 (FR15): the zero-contracts and empty-map states already existed
 * (`live-tracking-empty`, `positions-empty`); this component additionally
 * clears the selection and shows a generic `contract-access-error` message
 * when `ContractPositions` reports the selected contract as unauthorized
 * or nonexistent (`onUnauthorized`), never revealing which contracts exist.
 */
export function LiveTracking() {
  const [state, setState] = useState<LoadState>('loading')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)

  // KAN-168 (FR15): a 404/403 on the selected contract means it's
  // unauthorized or doesn't exist for this account — the backend's
  // uniform-404 convention means those are indistinguishable by design, so
  // the UI never tries to tell them apart either. Clear the selection and
  // show a generic message, revealing nothing about which contracts exist.
  function handleUnauthorizedContract() {
    setSelectedId(null)
    setAccessError("Ce contrat n'est pas disponible. Sélectionnez-en un autre.")
  }

  function selectContract(contractId: number) {
    setAccessError(null)
    setSelectedId(contractId)
  }

  useEffect(() => {
    let cancelled = false
    setState('loading')
    fetchContracts()
      .then((result) => {
        if (cancelled) return
        setContracts(result)
        setState('loaded')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 pb-6" data-testid="live-tracking">
      <PageHeader
        eyebrow="Flotte"
        title="Suivi en direct"
        actions={<div ref={setActionsSlot} className="flex flex-wrap items-center gap-3" />}
      >
        {state === 'loaded' && contracts.length > 0 && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={selectedId === null ? '' : String(selectedId)}
            onValueChange={(value) => {
              // Radix reports '' when the active item is clicked again: keep the selection.
              if (value) selectContract(Number(value))
            }}
            role="radiogroup"
            className="flex-wrap"
            data-testid="contract-selector"
            aria-label="Sélection du contrat"
          >
            {contracts.map((contract) => (
              <ToggleGroupItem
                key={contract.contractId}
                value={String(contract.contractId)}
                data-testid={`contract-option-${contract.contractId}`}
              >
                {contract.contractRef}
                {contract.clientName ? ` (${contract.clientName})` : ''}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4 px-4 md:px-6 empty:hidden">
        <GlobalMessage />

        {state === 'loading' && (
          <div data-testid="live-tracking-loading" role="status">
            <Skeleton className="h-9 w-64" />
            <span className="sr-only">Chargement des contrats…</span>
          </div>
        )}

        {state === 'error' && (
          <Alert variant="danger" data-testid="live-tracking-error">
            Impossible de charger vos contrats. Réessayez plus tard.
          </Alert>
        )}

        {state === 'loaded' && contracts.length === 0 && (
          <Empty data-testid="live-tracking-empty">
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

        {selectedId !== null && <ContractMessage contractId={selectedId} />}
      </div>

      {selectedId !== null && (
        <>
          <ContractPositions
            contractId={selectedId}
            onUnauthorized={handleUnauthorizedContract}
            actionsSlot={actionsSlot}
          />
          <div className="px-4 md:px-6">
            <HistoryDashboardLink contractId={selectedId} />
          </div>
        </>
      )}
    </div>
  )
}
