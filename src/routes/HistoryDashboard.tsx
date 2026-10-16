import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchContracts, type Contract } from '../api/contracts'
import { HistoryAccessGate } from '../history/HistoryAccessGate'
import { formatIsoDate } from '../history/dateRange'

type LoadState = 'loading' | 'loaded' | 'error'

/**
 * KAN-172 (FR1, FR2, FR25, NFR5) — the History Dashboard route's entry
 * gate and contract selector.
 *
 * FR1 is `RequireAuth` (`App.tsx` wraps this route in it, same convention
 * as every other protected route — `LiveTracking`, `Account`) — this
 * component only handles FR2 and FR25/NFR5.
 *
 * FR2: contract selection is scoped to the authenticated user by construction
 * — `fetchContracts()` hits `/api/v1/contracts/list.php`, which already
 * returns only the caller's own contracts (or, for an admin, every contract
 * with `clientName` attached — see `api/contracts.ts`'s doc comment); this
 * component never filters that list by any client-held role or id. A
 * missing/invalid selection (`selectedId === null`, including an `?contrat_id=`
 * query param that isn't a positive integer) is treated as "no contract
 * selected": only the selector renders, no data panels.
 *
 * The `?contrat_id=` query param is `LiveTracking`'s/`HistoryDashboardLink`'s
 * (KAN-165) handoff. It is read once on mount as the *initial* selection
 * candidate only — never re-validated against the fetched contract list
 * client-side (that would be re-implementing server-owned gating). Whether
 * it's actually accessible is decided exclusively by the real history fetch
 * inside `HistoryAccessGate`, via its `/api/v1` 404 (FR25/NFR5). An
 * unparseable/absent param leaves `selectedId` at `null`, i.e. "no contract
 * selected" (FR2) — not an error.
 *
 * FR25/NFR5: `HistoryAccessGate` is the single place that decides and
 * renders the merged not-found/not-yours state; this component's only
 * responsibility on that signal (`onUnauthorizedContract`) is clearing the
 * selection and showing one generic, non-identifying message here too (so a
 * param-driven deep link into an inaccessible contract behaves identically
 * to clicking an inaccessible one in the selector).
 */
export function HistoryDashboard() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<LoadState>('loading')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [accessError, setAccessError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = searchParams.get('contrat_id')
    if (raw === null) return null
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  })

  function handleUnauthorizedContract() {
    setSelectedId(null)
    // Same text/markup as HistoryAccessGate's own message (NFR5): whether
    // the rejection came from a deep-linked param or a selector click must
    // look identical either way.
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
          Historique
        </h1>
      </header>

      {state === 'loading' && (
        <p data-testid="history-dashboard-loading" style={{ color: 'var(--color-text-muted)' }}>
          Chargement des contrats…
        </p>
      )}

      {state === 'error' && (
        <p
          data-testid="history-dashboard-error"
          role="alert"
          style={{ color: 'var(--color-danger)' }}
        >
          Impossible de charger vos contrats. Réessayez plus tard.
        </p>
      )}

      {state === 'loaded' && contracts.length === 0 && (
        <p data-testid="history-dashboard-empty" style={{ color: 'var(--color-text-muted)' }}>
          Aucun contrat n'est associé à votre compte.
        </p>
      )}

      {state === 'loaded' && contracts.length > 0 && (
        <div
          role="radiogroup"
          className="flex flex-col gap-2"
          data-testid="history-contract-selector"
          aria-label="Sélection du contrat"
        >
          {contracts.map((contract) => (
            <button
              key={contract.contractId}
              type="button"
              role="radio"
              data-testid={`history-contract-option-${contract.contractId}`}
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
        <p data-testid="history-access-error-banner" role="alert" style={{ color: 'var(--color-danger)' }}>
          {accessError}
        </p>
      )}

      {selectedId === null && !accessError && state === 'loaded' && contracts.length > 0 && (
        <p data-testid="history-dashboard-no-selection" style={{ color: 'var(--color-text-muted)' }}>
          Sélectionnez un contrat pour afficher son historique.
        </p>
      )}

      {selectedId !== null && (
        <HistoryAccessGate contractId={selectedId} onUnauthorized={handleUnauthorizedContract}>
          {(resolved) => (
            // KAN-174 (map/time-slider/trail/replay) and KAN-175 (charts,
            // device checklist, lot-hooks, selection summary — FR4, FR9,
            // FR19-FR24) render the actual dashboard content here; this
            // story only proves the contract is accessible and resolves the
            // default date range (FR3, already KAN-170's job) before handing
            // off. Kept intentionally minimal so neither later story has to
            // unwind a placeholder implementation.
            <section data-testid="history-dashboard-ready" className="flex flex-col gap-2">
              <p style={{ color: 'var(--color-text)' }}>
                Contrat {resolved.history.contract.ContratRef} — période du{' '}
                {formatIsoDate(resolved.start)} au {formatIsoDate(resolved.end)}.
              </p>
              <p style={{ color: 'var(--color-text-muted)' }}>
                {resolved.history.devices.length} appareil(s), {resolved.history.count} mesure(s).
              </p>
            </section>
          )}
        </HistoryAccessGate>
      )}
    </main>
  )
}
