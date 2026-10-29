import { useEffect, useState } from 'react'
import { fetchContracts, type Contract } from '../api/contracts'
import { Alert, AlertDescription } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { PageHeader } from '@/ui/patterns/page-header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { Skeleton } from '@/ui/skeleton'
import { PilotageWorkspace } from '../pilotage/PilotageWorkspace'

type LoadState = 'loading' | 'loaded' | 'error'

/**
 * KAN-227 (FR10): PAT-LIST page — `PageHeader` with the contract choice in its
 * filter slot as the kit `Select` (trigger `pilotage-contract-selector`, one
 * `SelectItem` per contract `pilotage-contract-option-{id}`), then the
 * workspace in the page body. Copy and logic unchanged.
 *
 * KAN-159 (FR1-FR6, NFR2, NFR4, NFR9, NFR10) — Device Pilotage's entry gate
 * and contract selector, mirroring Live Tracking's own (KAN-158
 * `LiveTracking.tsx`): FR1's auth gate is `RequireAuth` (`App.tsx` wraps
 * this route in it); this component only resolves which contract is
 * selected (FR2) and fetches the same `/contracts/list.php` every contract
 * the account can see — it never filters that list to `MAIN` contracts
 * only (NFR4: the UI must not itself decide MAIN-vs-STD eligibility). The
 * server-side eligibility verdict is `PilotageWorkspace`'s job, once a
 * contract is picked.
 *
 * Same uniform-404 handling as Live Tracking (KAN-168 FR15): an
 * unauthorized/nonexistent contract clears the selection and shows a
 * generic message, revealing nothing about which contracts exist.
 */
export function DevicePilotage() {
  const [state, setState] = useState<LoadState>('loading')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)

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
    <div className="flex flex-col">
      <PageHeader title="Pilotage des devices">
        {state === 'loaded' && contracts.length > 0 && (
          <Select
            value={selectedId === null ? '' : String(selectedId)}
            onValueChange={(value) => {
              if (value) selectContract(Number(value))
            }}
          >
            <SelectTrigger
              data-testid="pilotage-contract-selector"
              aria-label="Sélection du contrat"
              className="w-full sm:w-72"
            >
              <SelectValue placeholder="— Sélectionner —" />
            </SelectTrigger>
            <SelectContent position="popper">
              {contracts.map((contract) => (
                <SelectItem
                  key={contract.contractId}
                  value={String(contract.contractId)}
                  data-testid={`pilotage-contract-option-${contract.contractId}`}
                >
                  {contract.contractRef}
                  {contract.clientName ? ` (${contract.clientName})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </PageHeader>

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {state === 'loading' && (
          <div data-testid="pilotage-contracts-loading" role="status" aria-busy className="flex flex-col gap-2">
            <span className="sr-only">Chargement des contrats…</span>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {state === 'error' && (
          <Alert variant="danger" data-testid="pilotage-contracts-error">
            <AlertDescription>Impossible de charger vos contrats. Réessayez plus tard.</AlertDescription>
          </Alert>
        )}

        {state === 'loaded' && contracts.length === 0 && (
          <Empty data-testid="pilotage-contracts-empty">
            <EmptyHeader>
              <EmptyDescription>Aucun contrat n'est associé à votre compte.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {accessError && (
          <Alert variant="danger" data-testid="pilotage-contract-access-error">
            <AlertDescription>{accessError}</AlertDescription>
          </Alert>
        )}

        {selectedId !== null && (
          <PilotageWorkspace contractId={selectedId} onUnauthorized={handleUnauthorizedContract} />
        )}
      </div>
    </div>
  )
}
