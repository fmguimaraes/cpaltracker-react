import { useEffect, useState } from 'react'
import { Alert } from '@/ui/alert'
import { PageHeader } from '@/ui/patterns/page-header'
import { TimePicker, type TimeRangeValue } from '@/ui/patterns/time-picker'
import { useContracts } from '../contracts/ContractContext'
import { HistoryAccessGate } from '../history/HistoryAccessGate'
import { validateDateRangeInputs } from '../history/dateRange'
import { HistoryReadyPanel } from '../history/HistoryReadyPanel'
import { dayRangeFromTimePicker, isoDays, timePickerValueFromDays } from '../history/timeRange'
import type { DefaultDateRangeState } from '../history/useDefaultDateRange'

type ReadyState = Extract<DefaultDateRangeState, { status: 'ready' }>

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
 * missing/invalid `?contrat_id=` query param (not a positive integer) is not
 * an error: once the list loads, the page defaults to the remembered contract
 * (sessionStorage, if still in the list) or the first one (operator decision
 * 2026-10-29). "No contract selected" (`selectedId === null`: no data panels)
 * then only remains with zero contracts or after an access rejection.
 *
 * The `?contrat_id=` query param is a deep-link entry (formerly
 * Live Tracking's KAN-165 handoff link, withdrawn 2026-10-29). `ContractProvider` reads it on arrival as the
 * selection candidate only — never re-validated against the fetched contract list
 * client-side (that would be re-implementing server-owned gating). Whether
 * it's actually accessible is decided exclusively by the real history fetch
 * inside `HistoryAccessGate`, via its `/api/v1` 404 (FR25/NFR5). A valid
 * param always wins over the remembered/first-contract default.
 *
 * FR25/NFR5: `HistoryAccessGate` is the single place that decides and
 * renders the merged not-found/not-yours state; this component's only
 * responsibility on that signal (`onUnauthorizedContract`) is clearing the
 * selection and showing one generic, non-identifying message here too (so a
 * param-driven deep link into an inaccessible contract behaves identically
 * to clicking an inaccessible one in the selector).
 */
export function HistoryDashboard() {
  // Operator decision 2026-10-29: the contract list/selection is global (`ContractProvider`, picker in the
  // sidebar; `?contrat_id=` deep links and the remembered default are handled there).
  const { contracts, loadState, selectedId, accessError, rejectContract } = useContracts()
  const [timeRangeError, setTimeRangeError] = useState<string | null>(null)

  // A new contract starts without the previous contract's period error.
  useEffect(() => {
    setTimeRangeError(null)
  }, [selectedId])

  // FR25/NFR5: the provider clears the selection and the remembered value, and exposes the same
  // text/markup as HistoryAccessGate's own message, whether the rejection came from a deep link or a pick.
  const handleUnauthorizedContract = rejectContract

  // FR9: the header `TimePicker` (presets + calendar) is the page's only period control (operator decision
  // 2026-10-29 removed the duplicate typed Du/Au entry). Its value maps onto the day-granular range through
  // `validateDateRangeInputs` (FR5-FR8): an invalid pick never reaches the fetch.
  function applyTimePickerValue(resolved: ReadyState, value: TimeRangeValue) {
    const days = isoDays(dayRangeFromTimePicker(value))
    const result = validateDateRangeInputs(days.start, days.end)
    if (!result.ok) {
      setTimeRangeError(result.error.message)
      return
    }
    setTimeRangeError(null)
    resolved.applyRange({ start: result.start, end: result.end })
  }

  const [gateState, setGateState] = useState<DefaultDateRangeState | null>(null)
  const [filterSlot, setFilterSlot] = useState<HTMLDivElement | null>(null)
  const state = selectedId === null ? null : gateState

  function renderHeaderFilters() {
    if (loadState !== 'loaded' || contracts.length === 0) return undefined
    // The device FilterBar is portalled here by `HistoryReadyPanel` once the history is ready.
    return <div ref={setFilterSlot} data-testid="history-header-filters" className="empty:hidden" />
  }

  function renderContractSection() {
    return (
      <>
        {loadState === 'loading' && (
          <p data-testid="history-dashboard-loading" className="text-sm text-muted-foreground">
            Chargement des contrats…
          </p>
        )}

        {loadState === 'error' && (
          <Alert variant="danger" data-testid="history-dashboard-error">
            Impossible de charger vos contrats. Réessayez plus tard.
          </Alert>
        )}

        {loadState === 'loaded' && contracts.length === 0 && (
          <p data-testid="history-dashboard-empty" className="text-sm text-muted-foreground">
            Aucun contrat n'est associé à votre compte.
          </p>
        )}

        {accessError && (
          <Alert variant="danger" data-testid="history-access-error-banner">
            {accessError}
          </Alert>
        )}

        {selectedId === null && !accessError && loadState === 'loaded' && contracts.length > 0 && (
          <p data-testid="history-dashboard-no-selection" className="text-sm text-muted-foreground">
            Sélectionnez un contrat pour afficher son historique.
          </p>
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col" data-testid="history-page">
      <PageHeader
        // Operator decision 2026-10-29: no visible title — the row holds the contract Select and the
        // TimePicker; the h1 stays for assistive tech and document structure (sr-only, out of the flex flow).
        title="Historique"
        className="[&_h1]:sr-only"
        chips={renderHeaderFilters()}
        actions={
          state?.status === 'ready' ? (
            <TimePicker
              value={timePickerValueFromDays(state.start, state.end)}
              onChange={(value) => applyTimePickerValue(state, value)}
            />
          ) : undefined
        }
      >
        {state?.status === 'ready' && timeRangeError && (
          <Alert variant="danger" data-testid="history-time-range-error">
            {timeRangeError}
          </Alert>
        )}
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {renderContractSection()}
        {selectedId !== null && (
          <HistoryAccessGate
            contractId={selectedId}
            onUnauthorized={handleUnauthorizedContract}
            onStateChange={setGateState}
          >
            {(resolved) => (
              // KAN-175 (FR4, FR9, FR19-FR24) owns everything inside `HistoryReadyPanel` — the device checklist
              // (driving `TimelineMap`'s `visibleDeviceIds`), the map itself (KAN-174), the three charts,
              // lot-hook history, sampling banner and the Stat row (selection summary).
              <section data-testid="history-dashboard-ready" className="flex flex-col gap-4">
                <HistoryReadyPanel history={resolved.history} filterSlot={filterSlot} />
              </section>
            )}
          </HistoryAccessGate>
        )}
      </div>
    </div>
  )
}
