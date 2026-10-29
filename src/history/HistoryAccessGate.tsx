import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { useDefaultDateRange, type DefaultDateRangeState } from './useDefaultDateRange'

type ReadyState = Extract<DefaultDateRangeState, { status: 'ready' }>

/**
 * KAN-172 (FR25, NFR5) — the History Dashboard's access-security gate.
 *
 * Wraps `useDefaultDateRange` (KAN-170, FR3) purely for its already-built
 * 404-vs-generic-error distinction: fetching a contract's history is the
 * only call this story needs to make to prove the selected `contractId` is
 * actually accessible, and that hook already makes exactly that call. This
 * component adds no gating logic of its own — the `/api/v1` 404 on an
 * unauthorized-or-nonexistent contract (`cpal_contrat_autorise()`'s uniform
 * anti-enumeration response, same backend fact KAN-168/KAN-170 already rely
 * on) is the ONLY signal used to decide FR25's merged state. No client-side
 * allow-list check against the fetched contract list is ever done here —
 * gating stays entirely server-owned (epic KAN-139 constraint).
 *
 * FR25: a nonexistent contract and one belonging to another client both
 * surface as the exact same `history-access-error` message — this
 * component never has enough information to tell them apart (the backend
 * deliberately returns the same 404 either way) and must not try.
 *
 * NFR5: the message text, the `role="alert"` markup, and the timing (one
 * fetch either way) are identical regardless of which of the two cases
 * applies — there is nothing in this component's output that could leak
 * which one occurred.
 *
 * KAN-174/KAN-175 own what actually renders once a contract is confirmed
 * accessible (map, charts, checklist, lot-hooks, selection summary — FR4,
 * FR9-FR24). This gate's `children` render prop is deliberately the only
 * extension point: it is called with the resolved default range and the
 * already-fetched `HistoryResponse` only once `status === 'ready'`, so later
 * stories plug in without this file changing. KAN-176 (FR5-FR8, NFR8) is
 * exactly that: it mounts `DateRangePicker` in `HistoryDashboard` and wires
 * its `onApply` straight to the `applyRange` callback this gate's resolved
 * state now carries (from `useDefaultDateRange`) — this file itself needed
 * no change for that.
 *
 * KAN-175 (FR4, FR23) — the `status === 'error'` branch below (a generic
 * network/fetch failure distinct from the `unauthorized` 404 above) is the
 * `history-fetch-error` extension point KAN-172 deliberately scaffolded as
 * a plain, static message and left for this story to give real dismissible
 * banner behavior: a local `dismissed` flag (reset whenever `contractId`
 * changes, so switching contracts always re-shows a genuinely new failure)
 * lets the user clear the banner without it reappearing on its own.
 */
export function HistoryAccessGate({
  contractId,
  onUnauthorized,
  children,
  onStateChange,
}: {
  contractId: number
  /**
   * Called once when access turns out to be denied, so the caller (the
   * contract selector) can clear its selection — mirrors
   * `ContractPositions`'s/`LiveTracking`'s KAN-168 `onUnauthorized` pattern.
   * Not called on every render while the denied state persists.
   */
  onUnauthorized?: () => void
  children: (resolved: ReadyState) => ReactNode
  /**
   * KAN-226 (FR9) — reports every state change of the gate to the page, so
   * the page header's `TimePicker` can read the resolved range and apply a
   * new one. Optional: the gate itself still renders only its own states.
   */
  onStateChange?: (state: DefaultDateRangeState) => void
}) {
  const state = useDefaultDateRange(contractId)

  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized
  const notifiedRef = useRef(false)

  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange
  useEffect(() => {
    onStateChangeRef.current?.(state)
  }, [state])

  useEffect(() => {
    if (state.status === 'unauthorized' && !notifiedRef.current) {
      notifiedRef.current = true
      onUnauthorizedRef.current?.()
    }
    if (state.status !== 'unauthorized') {
      notifiedRef.current = false
    }
  }, [state.status])

  // FR23 — dismissible, not auto-dismissing: the banner stays hidden once
  // the user closes it, UNTIL a genuinely new failure (a different
  // contract selection) could occur.
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    setDismissed(false)
  }, [contractId])

  if (state.status === 'loading') {
    return (
      <p data-testid="history-access-loading" className="text-sm text-muted-foreground">
        Chargement de l'historique…
      </p>
    )
  }

  if (state.status === 'unauthorized') {
    // FR25/NFR5 — identical message and markup for "doesn't exist" and
    // "exists but isn't yours"; never mentions the contract id.
    return (
      <Alert variant="danger" data-testid="history-access-error">
        Ce contrat n'est pas disponible. Sélectionnez-en un autre.
      </Alert>
    )
  }

  if (state.status === 'error') {
    if (dismissed) return null
    return (
      <Alert variant="danger" className="flex items-center justify-between gap-3" data-testid="history-fetch-error">
        <span>Impossible de charger l'historique de ce contrat. Réessayez plus tard.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="history-fetch-error-dismiss"
          aria-label="Fermer ce message"
          onClick={() => setDismissed(true)}
        >
          Fermer
        </Button>
      </Alert>
    )
  }

  return <>{children(state)}</>
}
