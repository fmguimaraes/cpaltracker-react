import { useEffect, useState } from 'react'
import { fetchContracts, type Contract } from '../api/contracts'

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
 * The rest of the feature area (map rendering, refresh, filters, messaging)
 * is KAN-160/162/165/168's job — selecting a contract here only tracks
 * which one is selected for those stories to build on.
 */
export function LiveTracking() {
  const [state, setState] = useState<LoadState>('loading')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

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
          Suivi en direct
        </h1>
      </header>

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
              onClick={() => setSelectedId(contract.contractId)}
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
    </main>
  )
}
