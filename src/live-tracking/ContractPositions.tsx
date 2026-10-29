import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ApiError } from '../api/client'
import { fetchPositions, type Position } from '../api/positions'
import { DeviceFilter } from './DeviceFilter'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'
import { PositionsMap } from './PositionsMap'
import { FleetPanel } from './FleetPanel'
import { massStatus } from './markerStyle'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'

type LoadState = 'loading' | 'loaded' | 'error'

function formatLastUpdated(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * KAN-160/KAN-162 (FR3/FR4/FR8/FR9/FR10) — fetches and renders the selected
 * contract's last-known device positions, with a manual refresh and a
 * client-side device-visibility filter.
 *
 * KAN-162's Technical Requirement ("update 'last updated' only on success,
 * not on failure — keep showing the prior snapshot") is why the initial
 * load and a later refresh use separate state: `state`/`positions` only
 * ever move forward on success, while `refreshing`/`refreshError` are
 * transient UI state that never touch the last-good snapshot. A refresh
 * failure therefore surfaces a small inline error alongside the existing
 * map rather than replacing it with a full error state.
 *
 * No polling and no socket.io-client anywhere here or elsewhere in this
 * codebase (verified by `grep -r "socket.io" src`) — refresh is manual
 * only, reusing the same `fetchPositions` call as the initial load and as
 * a contract switch.
 *
 * KAN-168 (FR15): a 404 from `devices/positions.php` means this contract id
 * is unauthorized or doesn't exist for the caller — `cpal_contrat_autorise()`
 * returns the same uniform 404 for both cases by design, so this component
 * doesn't try to tell them apart. It reports the condition to the parent via
 * `onUnauthorized` instead of rendering its own error, since the correct UI
 * response (clear the selection, show a generic message) lives one level
 * up, where the selector is.
 *
 * Only 404 triggers this — the endpoint's one 403 means `mustChangePassword`
 * (an account-level gate unrelated to this contract, and one that redirects
 * the user away from this screen entirely before this component ever
 * mounts), not a contract-authorization signal, so folding it in here would
 * mislabel it as "this contract isn't available."
 */
export function ContractPositions({
  contractId,
  onUnauthorized,
  actionsSlot,
}: {
  contractId: number
  onUnauthorized?: () => void
  /**
   * FR8: the page header's actions slot (last updated + refresh). `undefined`
   * renders them inline above the map; `null` means the slot is not mounted yet.
   */
  actionsSlot?: HTMLElement | null
}) {
  const [state, setState] = useState<LoadState>('loading')
  const [positions, setPositions] = useState<Position[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const showAll = useDeviceVisibilityStore((s) => s.showAll)
  const hiddenChipIds = useDeviceVisibilityStore((s) => s.hiddenChipIds)

  // Tracks which contractId is current so a refresh in flight when the
  // user switches contracts can detect it's stale and discard its result
  // instead of overwriting the new contract's data (mirrors the `cancelled`
  // guard below, but reusable from `refresh()`, which runs outside the effect).
  const activeContractIdRef = useRef(contractId)
  // Updated every render rather than added as an effect dependency, so a
  // new inline callback identity from the parent never re-triggers the fetch.
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  useEffect(() => {
    let cancelled = false
    activeContractIdRef.current = contractId
    setState('loading')
    setRefreshError(null)
    setRefreshing(false)
    showAll()
    fetchPositions(contractId)
      .then((result) => {
        if (cancelled) return
        setPositions(result)
        setState('loaded')
        setLastUpdated(new Date())
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          onUnauthorizedRef.current?.()
          return
        }
        setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [contractId, showAll])

  function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    fetchPositions(contractId)
      .then((result) => {
        if (activeContractIdRef.current !== contractId) return
        setPositions(result)
        setLastUpdated(new Date())
      })
      .catch(() => {
        if (activeContractIdRef.current !== contractId) return
        setRefreshError('Impossible de rafraîchir les positions. Dernières positions connues affichées.')
      })
      .finally(() => {
        setRefreshing(false)
      })
  }

  // Hooks stay above the early returns below.
  const fleetStatuses = useMemo(() => positions.map((p) => massStatus(p.mass)), [positions])
  const statusByChip = useMemo(
    () => Object.fromEntries(positions.map((p) => [p.chipId, massStatus(p.mass)])),
    [positions],
  )

  if (state === 'loading') {
    return (
      <div data-testid="positions-loading" role="status" className="px-4 md:px-6">
        <Skeleton className="h-96 w-full md:h-176" />
        <span className="sr-only">Chargement des positions…</span>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="px-4 md:px-6">
        <Alert variant="danger" data-testid="positions-error">
          Impossible de charger les positions de ce contrat. Réessayez plus tard.
        </Alert>
      </div>
    )
  }

  const visiblePositions = positions.filter((p) => !hiddenChipIds.has(p.chipId))

  const actions = (
    <>
      {lastUpdated && (
        <span data-testid="positions-last-updated" className="text-sm text-muted-foreground tabular-nums">
          Dernière mise à jour : {formatLastUpdated(lastUpdated)}
        </span>
      )}
      <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} data-testid="positions-refresh">
        {refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}
      </Button>
    </>
  )
  let actionsNode: ReactNode = null
  if (actionsSlot === undefined) actionsNode = <div className="flex items-center gap-3 px-4 md:px-6">{actions}</div>
  else if (actionsSlot) actionsNode = createPortal(actions, actionsSlot)

  return (
    <div className="flex flex-col gap-4">
      {actionsNode}

      {refreshError && (
        <div className="px-4 md:px-6">
          <Alert variant="danger" data-testid="positions-refresh-error">
            {refreshError}
          </Alert>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="px-4 md:px-6">
          <Empty data-testid="positions-empty">
            <EmptyHeader>
              <EmptyDescription>Aucune position disponible pour ce contrat.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="relative flex flex-col md:block md:h-176" data-testid="live-split">
          <div className="h-96 md:h-full">
            <PositionsMap positions={visiblePositions} />
          </div>
          <FleetPanel statuses={fleetStatuses}>
            <DeviceFilter chipIds={positions.map((p) => p.chipId)} statuses={statusByChip} />
          </FleetPanel>
        </div>
      )}
    </div>
  )
}
