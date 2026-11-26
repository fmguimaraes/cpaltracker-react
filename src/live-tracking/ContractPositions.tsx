import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ApiError } from '../api/client'
import { fetchPositions, type Position } from '../api/positions'
import { DeviceFilter } from './DeviceFilter'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'
import { PositionsMap } from './PositionsMap'
import type { FleetMapFitControl, MapTrail, MapViewport } from '@/ui/map'
import { FleetPanel } from './FleetPanel'
import { massStatus } from './markerStyle'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Spinner } from '@/ui/spinner'
import type { TimeRangeValue } from '@/ui/patterns/time-picker'
import { filterByLastReport } from './lastReportFilter'
import { ShellPageRefresh } from '@/ui/patterns/shell-title'
import { ShellRefreshButton } from '@/ui/patterns/shell-refresh'

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
/** What a page needs to draw its own freshness control (see `onRefreshState`). */
export interface PositionsRefreshState {
  lastUpdated: Date | null
  refreshing: boolean
  /** The last refresh failed (the map keeps the last known positions). */
  failed: boolean
  refresh: () => void
}

export function ContractPositions({
  contractId,
  onUnauthorized,
  actionsSlot,
  footerSlot,
  period,
  load = fetchPositions,
  filter,
  showFleetPanel = true,
  selectedChipId,
  onSelectDevice,
  focus,
  highlightedChipId,
  reveal,
  mapPositions,
  onViewportChange,
  fitKey,
  loadMax,
  fitRequest,
  fitControl,
  markerStyle,
  onMapClick,
  keepMapWhenEmpty = false,
  trails,
  refreshInShell = false,
  onRefreshState,
  emptyNotice,
}: {
  /**
   * `null` = the contract list is still loading (Pulse): the map and its loader show, nothing is fetched yet
   * (FR15, EC17).
   */
  contractId: number | null
  onUnauthorized?: () => void
  /**
   * FR8: the page header's actions slot (last updated + refresh). `undefined`
   * renders them inline above the map; `null` means the slot is not mounted yet.
   * Ignored when `footerSlot` is set.
   */
  actionsSlot?: HTMLElement | null
  /**
   * KAN-272 (Pulse): alternative portal target for the actions (last updated + refresh),
   * rendered below the map instead of in the header. Takes precedence over `actionsSlot`
   * whenever it is passed at all (including `null`, meaning "not mounted yet").
   */
  footerSlot?: HTMLElement | null
  /**
   * Operator decision 2026-10-29 ("filter by last report"): when set, only devices whose latest position
   * timestamp falls inside the period are shown (map, fleet panel, device list). Client-side only.
   */
  period?: TimeRangeValue
  /** KAN-272 (Pulse): the data source, `fetchPositions` by default. Must be referentially stable. */
  load?: (contractId: number) => Promise<Position[]>
  /** KAN-272 (Pulse): extra client-side predicate (lot filter) applied after `period`. */
  filter?: (position: Position) => boolean
  /** KAN-272 (Pulse): `false` hides the fleet panel (and its device list); Live Tracking keeps it. */
  showFleetPanel?: boolean
  /** Pulse: controlled marker selection, passed to `PositionsMap` (Live Tracking leaves it internal). */
  selectedChipId?: string | null
  /** Pulse: notified of every marker selection change (`null` = deselected). */
  onSelectDevice?: (chipId: string | null) => void
  /** Pulse: a point (anomaly position) the map zooms onto and marks. */
  focus?: { lat: number; lng: number } | null
  /** Pulse: a device to emphasise on the map (anomaly card hover), passed to `PositionsMap`. */
  highlightedChipId?: string | null
  /** Pulse: a device to pan/zoom onto (anomaly card click), passed to `PositionsMap`. */
  reveal?: { chipId: string; tick: number; minZoom?: number } | null
  /**
   * Pulse timeline: when set, the map draws exactly these (playback positions, pallet chips) instead of the
   * filtered snapshot; loading/error/empty states still follow the snapshot, `period` and `filter`.
   */
  mapPositions?: Position[]
  /** Pulse: the map's visible bounds, on mount and after every pan/zoom (passed to `PositionsMap`). */
  onViewportChange?: (viewport: MapViewport) => void
  /** Pulse: the map auto-frames only when this key changes (passed to `PositionsMap`). */
  fitKey?: string
  /** Pulse: colour markers by remaining load against this weight and show the load legend (see `PositionsMap`). */
  loadMax?: number | null
  /** Pulse: bump to frame every pallet on the map ("Tout afficher"), passed to `PositionsMap`. */
  fitRequest?: number
  /** Pulse: the map's fit control overrides ("Vue d'ensemble"), passed to `PositionsMap`. */
  fitControl?: FleetMapFitControl
  /** Pulse: compact markers (labels on hover/selection), passed to `PositionsMap`. */
  markerStyle?: 'pill' | 'compact'
  /** Pulse: click on the map background, passed to `PositionsMap`. */
  onMapClick?: () => void
  /**
   * Pulse: when the period/filter (or the contract) leaves no position, keep the map (tiles and controls)
   * with a small notice on it instead of replacing it with the empty block (Live Tracking's default). The
   * map keeps its view, or opens on the contract's last known positions, or on the default centre.
   */
  keepMapWhenEmpty?: boolean
  /** Pulse playback: paths travelled so far, passed to `PositionsMap`. */
  trails?: MapTrail[]
  /**
   * Unified shell: last update + "↻" at the right end of the top bar (`ShellPageRefresh`), the time in the
   * button's tooltip. Takes precedence over `footerSlot` / `actionsSlot`.
   */
  refreshInShell?: boolean
  /**
   * Pulse layout v2: the page draws its own freshness control (top-bar chip). Notified of the last update,
   * the refresh in flight, a failed refresh and a stable `refresh`; this component then renders no refresh
   * control and no inline refresh error. Takes precedence over `refreshInShell` / `footerSlot` / `actionsSlot`.
   */
  onRefreshState?: (state: PositionsRefreshState) => void
  /**
   * With `keepMapWhenEmpty`: the page's own message for an empty map (e.g. Pulse's "Aucune palette
   * sélectionnée" + "Tout sélectionner"), shown in place of the period/contract message.
   */
  emptyNotice?: ReactNode
}) {
  const [state, setState] = useState<LoadState>('loading')
  const [allPositions, setPositions] = useState<Position[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  // Bumped by the error state's "Réessayer": re-runs the initial load.
  const [attempt, setAttempt] = useState(0)
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
    if (contractId === null) return
    showAll()
    load(contractId)
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
  }, [contractId, showAll, load, attempt])

  function refresh() {
    if (contractId === null) return
    setRefreshing(true)
    setRefreshError(null)
    load(contractId)
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

  // Pulse: report the refresh state upwards; `refresh` stays referentially stable.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const stableRefresh = useCallback(() => refreshRef.current(), [])
  const onRefreshStateRef = useRef(onRefreshState)
  onRefreshStateRef.current = onRefreshState
  const failed = refreshError !== null
  useEffect(() => {
    onRefreshStateRef.current?.({ lastUpdated, refreshing, failed, refresh: stableRefresh })
  }, [lastUpdated, refreshing, failed, stableRefresh])

  // Hooks stay above the early returns below.
  const positions = useMemo(() => {
    const inPeriod = period ? filterByLastReport(allPositions, period) : allPositions
    return filter ? inPeriod.filter(filter) : inPeriod
  }, [allPositions, period, filter])
  const fleetStatuses = useMemo(() => positions.map((p) => massStatus(p.mass)), [positions])
  const statusByChip = useMemo(
    () => Object.fromEntries(positions.map((p) => [p.chipId, massStatus(p.mass)])),
    [positions],
  )
  // Pulse's empty map opens on every last known position of the contract (period and filter ignored).
  const emptyFit = useMemo(
    () =>
      keepMapWhenEmpty
        ? allPositions.flatMap((p) => (p.latitude !== null && p.longitude !== null ? [[p.latitude, p.longitude] as [number, number]] : []))
        : undefined,
    [keepMapWhenEmpty, allPositions],
  )

  // FR15/FR22: while positions load (or failed) the map stays mounted with no marker; a loader or the error
  // sits with it. The page never shows a skeleton in place of the map.
  const loading = state === 'loading'
  const errored = state === 'error'
  const pending = loading || errored
  const visiblePositions = positions.filter((p) => !hiddenChipIds.has(p.chipId))
  // What the map draws; with `keepMapWhenEmpty`, its notice shows whenever this is empty (e.g. not during a
  // playback that has pallets to show).
  const drawn = pending ? [] : (mapPositions ?? visiblePositions)
  const emptyTestId = allPositions.length === 0 ? 'positions-empty' : 'positions-period-empty'
  const emptyMessage =
    allPositions.length === 0
      ? 'Aucune position disponible pour ce contrat.'
      : "Aucun appareil n'a émis de position sur cette période."

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
  if (onRefreshState || pending) actionsNode = null
  else if (refreshInShell)
    actionsNode = (
      <ShellPageRefresh>
        <ShellRefreshButton
          lastUpdated={lastUpdated}
          onRefresh={refresh}
          refreshing={refreshing}
          testId="positions-refresh"
          lastUpdatedTestId="positions-last-updated"
        />
      </ShellPageRefresh>
    )
  else if (footerSlot !== undefined) actionsNode = footerSlot ? createPortal(actions, footerSlot) : null
  else if (actionsSlot === undefined) actionsNode = <div className="flex items-center gap-3 px-4 md:px-6">{actions}</div>
  else if (actionsSlot) actionsNode = createPortal(actions, actionsSlot)

  return (
    <div className="flex flex-col gap-4 md:min-h-0 md:flex-1">
      {actionsNode}

      {refreshError && !onRefreshState && (
        <div className="px-4 pt-4 md:px-6">
          <Alert variant="danger" data-testid="positions-refresh-error">
            {refreshError}
          </Alert>
        </div>
      )}

      {errored && (
        <div className="flex flex-wrap items-center gap-3 px-4 md:px-6">
          <Alert variant="danger" data-testid="positions-error" className="flex-1">
            Impossible de charger les positions de ce contrat. Réessayez plus tard.
          </Alert>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)} data-testid="positions-retry">
            Réessayer
          </Button>
        </div>
      )}

      {!pending && positions.length === 0 && !keepMapWhenEmpty ? (
        <div className="px-4 md:px-6">
          <Empty data-testid={emptyTestId}>
            <EmptyHeader>
              <EmptyDescription>{emptyMessage}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="relative flex flex-col md:block md:min-h-0 md:flex-1" data-testid="live-split">
          <div className="h-96 md:h-full">
            <PositionsMap
              positions={drawn}
              selectedChipId={selectedChipId}
              onSelectDevice={onSelectDevice}
              focus={focus}
              highlightedChipId={highlightedChipId}
              reveal={reveal}
              onViewportChange={onViewportChange}
              fitKey={fitKey}
              // Without the fleet panel (Pulse) the corner is free of context: show the card by its marker.
              anchorTooltip={!showFleetPanel}
              loadMax={loadMax}
              fitRequest={fitRequest}
              fitControl={fitControl}
              markerStyle={markerStyle}
              onMapClick={onMapClick}
              trails={trails}
              emptyFit={pending ? undefined : emptyFit}
            />
            {loading && (
              // FR15: same card style as the map's notices; clear of the zoom/fit controls (top right).
              <div
                role="status"
                data-testid="positions-loading"
                data-overlay="map"
                className="pointer-events-none absolute inset-0 z-1000 flex items-center justify-center px-16"
              >
                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-overlay">
                  <Spinner aria-hidden role={undefined} />
                  <span>Chargement des positions…</span>
                </div>
              </div>
            )}
            {!pending && keepMapWhenEmpty && drawn.length === 0 && (
              // A message centred on the map (Pulse layout v2 §5), clear of the zoom/fit controls (top right).
              <div
                role="status"
                data-testid={emptyNotice ? 'positions-notice' : emptyTestId}
                data-overlay="map"
                className="pointer-events-none absolute inset-0 z-1000 flex items-center justify-center px-16"
              >
                <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground shadow-overlay">
                  {emptyNotice ?? <p>{emptyMessage}</p>}
                </div>
              </div>
            )}
          </div>
          {showFleetPanel && !pending && (
            <FleetPanel statuses={fleetStatuses}>
              <DeviceFilter chipIds={positions.map((p) => p.chipId)} statuses={statusByChip} />
            </FleetPanel>
          )}
        </div>
      )}
    </div>
  )
}
