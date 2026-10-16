import { useEffect, useRef, useState } from 'react'
import type { Position } from '../api/positions'
import type { TransferResult } from '../api/transfer'
import { DeviceList } from './DeviceList'
import { loadPilotageWorkspace } from './loadPilotageWorkspace'
import { SettingsForm } from './SettingsForm'
import { TransferForm } from './TransferForm'
import { TransferHistory } from './TransferHistory'

type State =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ineligible'; message: string }
  | { phase: 'empty' }
  | { phase: 'eligible'; devices: Position[] }

/**
 * KAN-159 (FR2-FR6, NFR2, NFR4, NFR9, NFR10) — one contract's pilotage
 * workspace: resolves eligibility (FR3) and renders its device list
 * (FR5/FR6), consuming only `/api/v1` (NFR2) and never computing MAIN
 * eligibility itself (NFR4) — see `loadPilotageWorkspace.ts`'s doc comment
 * for exactly which API calls back this and why.
 *
 * FR4 (active/inactive banner): deliberately NOT rendered by this
 * component. There is no GET-readable "is this contract active today"
 * flag in `/api/v1` (GAP2/GAP3) and this story has no write control of its
 * own to surface the one signal that does exist (a 409 `contract_inactive`
 * from a settings/transfer submit — KAN-163/166/169). `activeState.ts`'s
 * `isContractInactiveError()` is the shared primitive those stories call;
 * this is a known, explicitly-tracked gap, not a silent omission (see this
 * story's handoff report).
 *
 * KAN-163 (FR7-FR10, FR12) addition: alongside `DeviceList`, the eligible
 * branch now also mounts `SettingsForm` for the selected device — the
 * operator picks a device from the list (`DeviceList`'s `onSelect`) and
 * this component tracks which one; the first device is selected by
 * default so the form is visible without an extra click. Selection resets
 * whenever the contract (and so the device list) changes.
 *
 * KAN-169 (FR14-FR18) addition: alongside `SettingsForm`, the eligible
 * branch also mounts `TransferForm` (for the selected device) and
 * `TransferHistory`, as a separate section rather than replacing either
 * existing form. This component owns the transfer-history list because
 * CB29/FR18 scope it to "the contract's devices," not one device — a
 * transfer recorded for any device under this contract is appended here
 * and shown by `TransferHistory` regardless of which device is currently
 * selected in `DeviceList`. The list is reset whenever the contract
 * changes, for the same reason `selectedChipId` is. See
 * `TransferHistory.tsx`'s doc comment for why this is a session log, not
 * the full persisted history (no `/api/v1` read endpoint exists for it
 * yet — a documented gap, not fabricated data).
 */
export function PilotageWorkspace({
  contractId,
  onUnauthorized,
}: {
  contractId: number
  onUnauthorized?: () => void
}) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selectedChipId, setSelectedChipId] = useState<string | null>(null)
  const [transferHistory, setTransferHistory] = useState<TransferResult[]>([])
  // Same pattern as ContractPositions (KAN-160/168): kept in a ref so a new
  // inline `onUnauthorized` identity from the parent never re-triggers the
  // load effect below.
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    setSelectedChipId(null)
    setTransferHistory([])
    loadPilotageWorkspace(contractId)
      .then((result) => {
        if (cancelled) return
        if (result.kind === 'unauthorized') {
          onUnauthorizedRef.current?.()
          return
        }
        if (result.kind === 'ineligible') {
          setState({ phase: 'ineligible', message: result.message })
          return
        }
        if (result.kind === 'empty') {
          setState({ phase: 'empty' })
          return
        }
        setState({ phase: 'eligible', devices: result.devices })
        setSelectedChipId(result.devices[0]?.chipId ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setState({ phase: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [contractId])

  if (state.phase === 'loading') {
    return (
      <p data-testid="pilotage-loading" style={{ color: 'var(--color-text-muted)' }}>
        Chargement du pilotage…
      </p>
    )
  }

  if (state.phase === 'error') {
    return (
      <p data-testid="pilotage-error" role="alert" style={{ color: 'var(--color-danger)' }}>
        Impossible de charger le pilotage de ce contrat. Réessayez plus tard.
      </p>
    )
  }

  if (state.phase === 'ineligible') {
    // FR3: the server's own message, shown verbatim — this is the API's
    // intentional, designed-to-be-shown refusal text (pilotage_logic.php's
    // `cpal_pilotage_erreur_resolution()`), not raw error/stack-trace detail.
    return (
      <p data-testid="pilotage-ineligible" role="alert" style={{ color: 'var(--color-danger)' }}>
        {state.message}
      </p>
    )
  }

  if (state.phase === 'empty') {
    return <DeviceList devices={[]} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 md:flex-row">
        <DeviceList
          devices={state.devices}
          selectedChipId={selectedChipId ?? undefined}
          onSelect={setSelectedChipId}
        />
        {selectedChipId && <SettingsForm deviceId={selectedChipId} />}
      </div>

      {selectedChipId && (
        <section data-testid="pilotage-transfer-section" className="flex flex-col gap-6 md:flex-row">
          <TransferForm
            deviceId={selectedChipId}
            onTransferred={(result) => setTransferHistory((prev) => [...prev, result])}
          />
          <div data-testid="pilotage-transfer-history" className="flex-1">
            <TransferHistory entries={transferHistory} />
          </div>
        </section>
      )}
    </div>
  )
}
