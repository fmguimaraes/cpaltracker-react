import { useEffect, useState } from 'react'
import { fetchContracts, type Contract } from '../api/contracts'
import { PageTitle } from '../chrome/PageTitle'
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
 * own doc comment for why. The heading below uses the shared `PageTitle`
 * (FR9/FR10) instead of this route's own ad-hoc `<h1>` styling.
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
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <PageTitle>Suivi en direct</PageTitle>

      <GlobalMessage />

      {state === 'loading' && (
        <p data-testid="live-tracking-loading" style={{ color: 'var(--color-text-muted)' }}>
          Chargement des contrats…
        </p>
      )}

      {state === 'error' && (
        <p
          data-testid="live-tracking-error"
          role="alert"
          style={{ color: 'var(--color-danger)' }}
        >
          Impossible de charger vos contrats. Réessayez plus tard.
        </p>
      )}

      {state === 'loaded' && contracts.length === 0 && (
        <p data-testid="live-tracking-empty" style={{ color: 'var(--color-text-muted)' }}>
          Aucun contrat n'est associé à votre compte.
        </p>
      )}

      {state === 'loaded' && contracts.length > 0 && (
        <div
          role="radiogroup"
          className="flex flex-col gap-2"
          data-testid="contract-selector"
          aria-label="Sélection du contrat"
        >
          {contracts.map((contract) => (
            <button
              key={contract.contractId}
              type="button"
              role="radio"
              data-testid={`contract-option-${contract.contractId}`}
              aria-checked={selectedId === contract.contractId}
              onClick={() => selectContract(contract.contractId)}
              className="rounded-md border px-3 py-2 text-left text-sm"
              style={{
                borderColor:
                  selectedId === contract.contractId
                    ? 'var(--color-primary)'
                    : 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              {contract.contractRef}
              {contract.clientName ? ` (${contract.clientName})` : ''}
            </button>
          ))}
        </div>
      )}

      {accessError && (
        <p data-testid="contract-access-error" role="alert" style={{ color: 'var(--color-danger)' }}>
          {accessError}
        </p>
      )}

      {selectedId !== null && (
        <>
          <ContractMessage contractId={selectedId} />
          <ContractPositions contractId={selectedId} onUnauthorized={handleUnauthorizedContract} />
          <HistoryDashboardLink contractId={selectedId} />
        </>
      )}
    </main>
  )
}
