import { useEffect, useState } from 'react'
import { Skeleton } from '@/ui/skeleton'
import { Alert } from '@/ui/alert'
import { PeriodControl, type PeriodPreset } from '@/ui/patterns/period-control'
import { ShellBreadcrumb } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageActions, ShellPageTitle } from '@/ui/patterns/shell-title'
import { resolveRange, type TimeRangeValue } from '@/ui/patterns/time-picker'
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
/**
 * @deprecated Unified shell 2026-11-25: Pulse now carries this page's features (period statistics and lot
 * attach history in the pallet drawer, replay on the map). Kept, with its nav entry, until its removal is
 * confirmed.
 */
export function HistoryDashboard() {
  // Operator decision 2026-10-29: the contract list/selection is global (`ContractProvider`, picker in the
  // sidebar; `?contrat_id=` deep links and the remembered default are handled there).
  const { contracts, loadState, selectedId, accessError, rejectContract } = useContracts()
  const [timeRangeError, setTimeRangeError] = useState<string | null>(null)
  // The applied range is day-granular (always "custom" for the API): remember which shared preset produced it.
  const [preset, setPreset] = useState<PeriodPreset | null>(null)

  // A new contract starts without the previous contract's period error.
  useEffect(() => {
    setTimeRangeError(null)
    setPreset(null)
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
    // The device checklist popover trigger ("Appareils") is portalled here by `HistoryReadyPanel` once the history is ready.
    return <div ref={setFilterSlot} data-testid="history-header-filters" className="empty:hidden" />
  }

  function renderContractSection() {
    return (
      <>
        {loadState === 'loading' && (
          <div data-testid="history-dashboard-loading" role="status" aria-busy className="flex flex-col gap-2">
            <span className="sr-only">Chargement des contrats…</span>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
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
      {/* Unified shell: the title is the top bar's breadcrumb (no H1 band); device filter and period are its
          global controls. The h1 stays for assistive tech and document structure. */}
      <h1 className="sr-only">Historique</h1>
      <ShellPageTitle>
        <ShellBreadcrumb levels={[{ label: 'Historique' }]} />
      </ShellPageTitle>
      <ShellPageActions>
        <div className="flex items-center gap-2" data-testid="history-header">
          {renderHeaderFilters()}
          {state?.status === 'ready' && (
            <PeriodControl
              preset={preset}
              range={resolveRange(timePickerValueFromDays(state.start, state.end))}
              onPreset={(next) => {
                setPreset(next)
                applyTimePickerValue(state, { preset: next })
              }}
              onCustom={(from, to) => {
                setPreset(null)
                applyTimePickerValue(state, { preset: 'custom', from, to })
              }}
              testId="time"
            />
          )}
        </div>
      </ShellPageActions>

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {state?.status === 'ready' && timeRangeError && (
          <Alert variant="danger" data-testid="history-time-range-error">
            {timeRangeError}
          </Alert>
        )}
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
