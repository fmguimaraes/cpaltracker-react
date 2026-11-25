import { useState } from 'react'
import { Alert } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { PeriodControl, periodPresetOf } from '@/ui/patterns/period-control'
import { ShellBreadcrumb } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageActions, ShellPageTitle } from '@/ui/patterns/shell-title'
import { resolveRange, type TimeRangeValue } from '@/ui/patterns/time-picker'
import { useContracts } from '../contracts/ContractContext'
import { ContractMessage } from '../live-tracking/ContractMessage'
import { ContractPositions } from '../live-tracking/ContractPositions'
import { DEFAULT_LIVE_PERIOD } from '../live-tracking/lastReportFilter'

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
 * mounts that child, and `ContractMessage` when it
 * is. The KAN-165 History handoff link is withdrawn (operator decision 2026-10-29). The global announcement (KAN-165 FR11/FR13) is withdrawn by operator
 * decision 2026-10-29.
 *
 * KAN-171 moved `ClientLogo` (previously mounted here) into the new shared
 * `AppChrome` (`App.tsx`), which now wraps this route — see `AppChrome`'s
 * own doc comment for why. The heading below uses the kit `PageHeader` (FR7/FR8)
 * and the contract choice is global: `ContractProvider` + the sidebar
 * `ContractSelect` (operator decision 2026-10-29).
 * FR8: PAT-SPLIT — the refresh action of `ContractPositions` is portalled into
 * the header's actions slot.
 *
 * KAN-168 (FR15): the zero-contracts and empty-map states already existed
 * (`live-tracking-empty`, `positions-empty`); this component additionally
 * clears the selection and shows a generic `contract-access-error` message
 * when `ContractPositions` reports the selected contract as unauthorized
 * or nonexistent (`onUnauthorized`), never revealing which contracts exist.
 */
/**
 * @deprecated Unified shell 2026-11-25: Pulse now carries this page's features (fleet status summary in the
 * pallet selector, state badges on the markers). Kept, with its nav entry, until its removal is confirmed.
 */
export function LiveTracking() {
  // Operator decision 2026-10-29: the contract list/selection is global (`ContractProvider`, picker in the sidebar).
  const { contracts, loadState: state, selectedId, accessError, rejectContract } = useContracts()
  const [period, setPeriod] = useState<TimeRangeValue>(DEFAULT_LIVE_PERIOD)
  // The shared period control speaks the app's one preset set (a subset of the TimePicker's values).
  const periodPreset = periodPresetOf(period.preset)

  // KAN-168 (FR15): a 404/403 on the selected contract means it's unauthorized or doesn't exist for this
  // account — indistinguishable by design. The provider clears the selection and the remembered value and
  // exposes one generic message, revealing nothing about which contracts exist.
  const handleUnauthorizedContract = rejectContract

  return (
    <div // md+: the page fills the viewport under the 48 px shell toolbar, the map taking all the height left
      // below the header (no blank band); below md the page stacks and scrolls.
      className="flex flex-col page-fill-height max-md:pb-6"
      data-testid="live-tracking">
      {/* Unified shell: the title is the top bar's breadcrumb (no H1 band), the period its global control. */}
      <h1 className="sr-only">Suivi en direct</h1>
      <ShellPageTitle>
        <ShellBreadcrumb levels={[{ label: 'Suivi en direct' }]} />
      </ShellPageTitle>
      {state === 'loaded' && contracts.length > 0 && (
        <ShellPageActions>
          <PeriodControl
            preset={periodPreset}
            range={resolveRange(period)}
            onPreset={(preset) => setPeriod({ preset })}
            onCustom={(from, to) => setPeriod({ preset: 'custom', from, to })}
            testId="time"
          />
        </ShellPageActions>
      )}

      <div className="flex flex-col gap-4 shrink-0 px-4 py-4 md:px-6 empty:hidden">
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
            refreshInShell
            period={period}
          />
        </>
      )}
    </div>
  )
}
