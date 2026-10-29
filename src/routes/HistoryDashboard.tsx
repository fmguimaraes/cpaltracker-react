import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchContracts, type Contract } from '../api/contracts'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { FilterBar } from '@/ui/patterns/filter-bar'
import { PageHeader } from '@/ui/patterns/page-header'
import { TimePicker, type TimeRangeValue } from '@/ui/patterns/time-picker'
import { DateRangePicker } from '../history/DateRangePicker'
import { HistoryAccessGate } from '../history/HistoryAccessGate'
import { formatIsoDate, validateDateRangeInputs } from '../history/dateRange'
import { HistoryReadyPanel } from '../history/HistoryReadyPanel'
import { dayRangeFromTimePicker, isoDays, timePickerValueFromDays } from '../history/timeRange'
import type { DefaultDateRangeState } from '../history/useDefaultDateRange'

type ReadyState = Extract<DefaultDateRangeState, { status: 'ready' }>

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
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [timeRangeError, setTimeRangeError] = useState<string | null>(null)
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
    setLoadState('loading')
    fetchContracts()
      .then((result) => {
        if (cancelled) return
        setContracts(result)
        setLoadState('loaded')
      })
      .catch(() => {
        if (cancelled) return
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function selectContractByReference(reference: string) {
    const wanted = reference.trim().toLowerCase()
    const match = contracts.find((contract) => contract.contractRef.toLowerCase() === wanted)
    if (match) selectContract(match.contractId)
  }

  // FR9: the header `TimePicker` (presets + calendar) maps onto the day-granular range through the same
  // validation as the typed entry (FR5-FR8): an invalid pick never reaches the fetch.
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
  const state = selectedId === null ? null : gateState

  const selectedContract = contracts.find((contract) => contract.contractId === selectedId)

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

        {loadState === 'loaded' && contracts.length > 0 && (
          <div
            role="radiogroup"
            className="flex flex-wrap gap-2"
            data-testid="history-contract-selector"
            aria-label="Sélection du contrat"
          >
            {contracts.map((contract) => (
              <Button
                key={contract.contractId}
                type="button"
                variant="outline"
                role="radio"
                data-testid={`history-contract-option-${contract.contractId}`}
                aria-checked={selectedId === contract.contractId}
                onClick={() => selectContract(contract.contractId)}
                className="aria-checked:border-primary aria-checked:bg-muted"
              >
                {contract.contractRef}
                {contract.clientName ? ` (${contract.clientName})` : ''}
              </Button>
            ))}
          </div>
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
        title="Historique"
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
        <FilterBar
          attributes={['Contrat']}
          filters={
            selectedContract
              ? [
                  {
                    id: 'contract',
                    attribute: 'Contrat',
                    value: `${selectedContract.contractRef}${selectedContract.clientName ? ` (${selectedContract.clientName})` : ''}`,
                  },
                ]
              : []
          }
          onRemove={() => {
            setAccessError(null)
            setTimeRangeError(null)
            setSelectedId(null)
          }}
          onAdd={({ value }) => selectContractByReference(value)}
        />
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
                <p className="text-sm text-foreground">
                  Contrat {resolved.history.contract.ContratRef} — période du{' '}
                  {resolved.start ? formatIsoDate(resolved.start) : '…'} au{' '}
                  {resolved.end ? formatIsoDate(resolved.end) : '…'}.
                </p>
                {/*
                 * KAN-176 (FR5-FR8, NFR8) — the typed date entry next to the header `TimePicker`.
                 * `resolved.applyRange` is `useDefaultDateRange`'s explicit-range re-fetch, so applying a range
                 * goes through the exact same ready/unauthorized/error handling as the initial load; a rejected
                 * range is caught by `DateRangePicker`'s own `validateDateRangeInputs` call before `onApply` is
                 * reached (FR5: no request while invalid).
                 */}
                <DateRangePicker
                  initialStart={resolved.start}
                  initialEnd={resolved.end}
                  onApply={resolved.applyRange}
                />
                <HistoryReadyPanel history={resolved.history} />
              </section>
            )}
          </HistoryAccessGate>
        )}
      </div>
    </div>
  )
}
