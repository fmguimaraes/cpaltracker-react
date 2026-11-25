import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { Alert, AlertDescription } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { ShellBreadcrumb, type ShellBreadcrumbLevel } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageTitle } from '@/ui/patterns/shell-title'
import { Skeleton } from '@/ui/skeleton'
import { useContracts } from '../contracts/ContractContext'
import { DEVICE_PILOTAGE_PATH } from '../auth/paths'
import { DeviceList } from '../pilotage/DeviceList'
import { loadPilotageWorkspace } from '../pilotage/loadPilotageWorkspace'
import type { Position } from '../api/positions'
import type { TransferResult } from '../api/transfer'

/**
 * KAN-227 (FR10): PAT-LIST page — `PageHeader` with the contract choice in its
 * workspace in the page body. Operator decision 2026-10-29: the contract
 * choice is global (`ContractProvider` + the sidebar `ContractSelect`), so this
 * page has no selector or contracts fetch of its own.
 *
 * KAN-159 (FR1-FR6, NFR2, NFR4, NFR9, NFR10) — Device Pilotage's entry gate
 * and contract selector, mirroring Live Tracking's own (KAN-158
 * `LiveTracking.tsx`): FR1's auth gate is `RequireAuth` (`App.tsx` wraps
 * this route in it); this component only resolves which contract is
 * selected (FR2) and fetches the same `/contracts/list.php` every contract
 * the account can see — it never filters that list to `MAIN` contracts
 * only (NFR4: the UI must not itself decide MAIN-vs-STD eligibility). The
 * server-side eligibility verdict (FR3/NFR4, `loadPilotageWorkspace`) is
 * resolved here too, once a contract is picked, and handed to its two child
 * routes — `PilotageDeviceList` (index) and `PilotageDeviceDetail`
 * (`:chipId`) — through the `Outlet` context, so both agree on the same
 * device list and the same contract-wide transfer-history session log
 * (KAN-169 FR18/CB29) without re-fetching it.
 *
 * Same uniform-404 handling as Live Tracking (KAN-168 FR15): an
 * unauthorized/nonexistent contract clears the selection and shows a
 * generic message, revealing nothing about which contracts exist.
 *
 * Replaces the former right-drawer device configuration (KAN-227/unified
 * shell) with a standalone page at `/pilotage/:chipId`: picking a device
 * navigates there (a real route, not an in-page panel) instead of opening a
 * drawer beside the table; ← (and the breadcrumb's "Pilotage") goes back to
 * the list the same way any other route change does, no manual history-state
 * bookkeeping needed. A contract switch while a device's page is open
 * returns to the list (the device belonged to the previous contract).
 */
export type PilotageOutletContext = {
  devices: Position[]
  transferHistory: TransferResult[]
  addTransfer: (result: TransferResult) => void
}

type WorkspaceState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ineligible'; message: string }
  | { phase: 'empty' }
  | { phase: 'eligible'; devices: Position[] }

export function DevicePilotage() {
  const { contracts, loadState: state, selectedId, accessError, rejectContract } = useContracts()
  const { chipId } = useParams<{ chipId?: string }>()
  const navigate = useNavigate()

  const [workspace, setWorkspace] = useState<WorkspaceState>({ phase: 'loading' })
  const [transferHistory, setTransferHistory] = useState<TransferResult[]>([])
  const addTransfer = useCallback(
    (result: TransferResult) => setTransferHistory((prev) => [...prev, result]),
    [],
  )
  // Same pattern as ContractPositions (KAN-160/168): kept in a ref so a new
  // inline `rejectContract` identity from the parent never re-triggers the
  // load effect below.
  const rejectContractRef = useRef(rejectContract)
  rejectContractRef.current = rejectContract

  useEffect(() => {
    if (selectedId === null) return
    let cancelled = false
    setWorkspace({ phase: 'loading' })
    setTransferHistory([])
    loadPilotageWorkspace(selectedId)
      .then((result) => {
        if (cancelled) return
        if (result.kind === 'unauthorized') {
          rejectContractRef.current()
          return
        }
        if (result.kind === 'ineligible') {
          setWorkspace({ phase: 'ineligible', message: result.message })
          return
        }
        if (result.kind === 'empty') {
          setWorkspace({ phase: 'empty' })
          return
        }
        setWorkspace({ phase: 'eligible', devices: result.devices })
      })
      .catch(() => {
        if (!cancelled) setWorkspace({ phase: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // A contract switch: the device's page belonged to the previous contract, so go back to the list.
  const previousContract = useRef(selectedId)
  useEffect(() => {
    const previous = previousContract.current
    previousContract.current = selectedId
    if (previous !== null && previous !== selectedId && chipId) navigate(DEVICE_PILOTAGE_PATH, { replace: true })
  }, [selectedId, chipId, navigate])

  const levels: ShellBreadcrumbLevel[] =
    chipId === undefined
      ? [{ label: 'Pilotage', testId: 'breadcrumb-pilotage' }]
      : [
          { label: 'Pilotage', to: DEVICE_PILOTAGE_PATH, testId: 'breadcrumb-pilotage' },
          { label: chipId, testId: 'breadcrumb-device' },
        ]

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Pilotage des devices</h1>
      <ShellPageTitle>
        <ShellBreadcrumb levels={levels} />
      </ShellPageTitle>

      <div className="flex flex-col gap-6 p-4 md:p-6">
        {state === 'loading' && (
          <div data-testid="pilotage-contracts-loading" role="status" aria-busy className="flex flex-col gap-2">
            <span className="sr-only">Chargement des contrats…</span>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {state === 'error' && (
          <Alert variant="danger" data-testid="pilotage-contracts-error">
            <AlertDescription>Impossible de charger vos contrats. Réessayez plus tard.</AlertDescription>
          </Alert>
        )}

        {state === 'loaded' && contracts.length === 0 && (
          <Empty data-testid="pilotage-contracts-empty">
            <EmptyHeader>
              <EmptyDescription>Aucun contrat n'est associé à votre compte.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {accessError && (
          <Alert variant="danger" data-testid="pilotage-contract-access-error">
            <AlertDescription>{accessError}</AlertDescription>
          </Alert>
        )}

        {selectedId !== null && workspace.phase === 'loading' && (
          <div data-testid="pilotage-loading" role="status" aria-busy className="flex flex-col gap-2">
            <span className="sr-only">Chargement du pilotage…</span>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {selectedId !== null && workspace.phase === 'error' && (
          <Alert variant="danger" data-testid="pilotage-error">
            <AlertDescription>
              Impossible de charger le pilotage de ce contrat. Réessayez plus tard.
            </AlertDescription>
          </Alert>
        )}

        {selectedId !== null && workspace.phase === 'ineligible' && (
          // FR3: the server's own message, shown verbatim — this is the API's
          // intentional, designed-to-be-shown refusal text (pilotage_logic.php's
          // `cpal_pilotage_erreur_resolution()`), not raw error/stack-trace detail.
          <Alert variant="danger" data-testid="pilotage-ineligible">
            <AlertDescription>{workspace.message}</AlertDescription>
          </Alert>
        )}

        {selectedId !== null && workspace.phase === 'empty' && <DeviceList devices={[]} />}

        {selectedId !== null && workspace.phase === 'eligible' && (
          <Outlet
            context={{ devices: workspace.devices, transferHistory, addTransfer } satisfies PilotageOutletContext}
          />
        )}
      </div>
    </div>
  )
}
