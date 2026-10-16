import { useEffect, useState } from 'react'
import { fetchContracts, type Contract } from '../api/contracts'
import { PilotageWorkspace } from '../pilotage/PilotageWorkspace'

type LoadState = 'loading' | 'loaded' | 'error'

/**
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          Pilotage des devices
        </h1>
      </header>

      {state === 'loading' && (
        <p data-testid="pilotage-contracts-loading" style={{ color: 'var(--color-text-muted)' }}>
          Chargement des contrats…
        </p>
      )}

      {state === 'error' && (
        <p
          data-testid="pilotage-contracts-error"
          role="alert"
          style={{ color: 'var(--color-danger)' }}
        >
          Impossible de charger vos contrats. Réessayez plus tard.
        </p>
      )}

      {state === 'loaded' && contracts.length === 0 && (
        <p data-testid="pilotage-contracts-empty" style={{ color: 'var(--color-text-muted)' }}>
          Aucun contrat n'est associé à votre compte.
        </p>
      )}

      {state === 'loaded' && contracts.length > 0 && (
        <div
          role="radiogroup"
          className="flex flex-col gap-2"
          data-testid="pilotage-contract-selector"
          aria-label="Sélection du contrat"
        >
          {contracts.map((contract) => (
            <button
              key={contract.contractId}
              type="button"
              role="radio"
              data-testid={`pilotage-contract-option-${contract.contractId}`}
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
        <p data-testid="pilotage-contract-access-error" role="alert" style={{ color: 'var(--color-danger)' }}>
          {accessError}
        </p>
      )}

      {selectedId !== null && (
        <PilotageWorkspace contractId={selectedId} onUnauthorized={handleUnauthorizedContract} />
      )}
    </main>
  )
}
