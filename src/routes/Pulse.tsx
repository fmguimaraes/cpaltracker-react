import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { House, Maximize2, PanelRightClose } from 'lucide-react'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { SkeletonRows } from '@/ui/patterns/skeleton-rows'
import { ShellBreadcrumb, type ShellBreadcrumbLevel } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageActions, ShellPageTitle } from '@/ui/patterns/shell-title'
import { cn } from '@/lib/utils'
import { AnomalyDetailView } from '../anomalies/AnomalyDetailView'
import { AnomaliesRail } from '../anomalies/AnomaliesRail'
import type { AnomalySelection } from '../anomalies/AnomalyList'
import { anomalyCardContent, cardHeadline, formatAbsolute, parseUtc } from '../anomalies/anomalyCard'
import { statusesForFilter } from '../anomalies/anomalyFormat'
import { ContractAnomalies } from '../anomalies/ContractAnomalies'
import { useLoad } from '../anomalies/useLoad'
import { fetchAnomalies } from '../api/anomalies'
import { fetchPulse } from '../api/pulse'
import type { Position } from '../api/positions'
import { alertPath } from '../auth/paths'
import { useContracts } from '../contracts/ContractContext'
import { ContractPositions, type PositionsRefreshState } from '../live-tracking/ContractPositions'
import { filterByLastReport } from '../live-tracking/lastReportFilter'
import { maxMass } from '../live-tracking/loadScale'
import { PalletPanel } from '../pulse/PalletPanel'
import { PalletRail } from '../pulse/PalletRail'
import { ALL_LOTS, PalletSelector } from '../pulse/PalletSelector'
import {
  CONTRACT_VIEW,
  INSTANT_PARAM,
  PALLET_PARAM,
  PERIOD_PARAM,
  usePulseNavigation,
  type ListView,
} from '../pulse/pulseSelection'
import { PulseFreshnessChip, PulseTimelineBar, useTimelineKeys, type AnomalyTick } from '../pulse/PulseTimelineBar'
import {
  DEFAULT_PERIOD,
  parsePeriodParam,
  periodParam,
} from '../pulse/timelinePositions'
import { usePulseTimeline } from '../pulse/usePulseTimeline'

/** A chip click flies to its pallet keeping the current zoom from this level on, or zooming to it. */
const CHIP_MIN_ZOOM = 10

/** Owner redesign 2026-11-25 (§9): the anomalies drawer's collapsed state, kept across visits. */
const DRAWER_KEY = 'cpal.pulse.anomaliesDrawer'

/** Every status, fetched once for the breadcrumb's anomaly level and the replay ticks. */
const ALL_STATUSES = statusesForFilter('all')

const DEFAULT_PERIOD_PARAM = periodParam(DEFAULT_PERIOD)

function readDrawerCollapsed(): boolean {
  try {
    return window.localStorage.getItem(DRAWER_KEY) === 'collapsed'
  } catch {
    return false
  }
}

function writeDrawerCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(DRAWER_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // Storage unavailable (private mode, quota): the state just isn't remembered.
  }
}

function parseInstant(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const ms = Number(value)
  return Number.isFinite(ms) ? ms : null
}

/**
 * KAN-272 (Pulse) on the unified shell (2026-11-25) — the app's main map page. The map fills the area
 * between the nav rail and the drawer, top bar to bottom edge (no bottom bar): the replay scrubber is one
 * overlay row inside the map (collapsed to "▶ Rejouer" live). The page's global controls sit in the shell's
 * top bar: pallet selector (hide/show, lot filter, localiser), period [24 h | 7 j | 30 j | Personnalisé], live
 * / replay chip, then last update + ↻ (ContractPositions). The breadcrumb (Pulse › pallet › anomaly) and the
 * URL (`palette`, `vue`, `anomalie`, `periode`, `t`) both follow the drawer, so back/forward walk the levels
 * and a deep link restores the drawer, the map focus and the period. The right drawer keeps its components:
 * the contract's anomalies (viewport-scoped), a pallet's panel, or an anomaly's detail.
 */
export function Pulse() {
  const { contracts, loadState: state, selectedId, accessError, rejectContract } = useContracts()
  const location = useLocation()
  const navigate = useNavigate()
  const { view, go, reset } = usePulseNavigation()
  // Deep link: the period, the replay instant and the pallet to bring into view, read once on arrival.
  const [initial] = useState(() => {
    const params = new URLSearchParams(location.search)
    return {
      choice: parsePeriodParam(params.get(PERIOD_PARAM)) ?? DEFAULT_PERIOD,
      instant: parseInstant(params.get(INSTANT_PARAM)),
      chipId: params.get(PALLET_PARAM) || null,
    }
  })
  const [loaded, setLoaded] = useState<Position[]>([])
  const [snapshotReady, setSnapshotReady] = useState(false)
  // "Charge pleine" of the weight ramp: the heaviest pallet of the latest snapshot.
  const loadMax = useMemo(() => maxMass(loaded), [loaded])
  const [loadedAt, setLoadedAt] = useState(() => new Date())
  const [lotChoice, setLotChoice] = useState(ALL_LOTS)
  // Pallets unchecked in the selector: not drawn, and their anomalies not listed.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  // Anomaly cards: the selected one (its pallet is selected and revealed on the map), the hovered one's
  // pallet (highlighted), and the reveal request (a new tick re-centres even on the same pallet).
  const [cardSelection, setCardSelection] = useState<AnomalySelection | null>(null)
  const [hoveredChipId, setHoveredChipId] = useState<string | null>(null)
  // A chip click asks for a fly-to (`minZoom`); a card click keeps the map kit's default reveal.
  const [reveal, setReveal] = useState<{ chipId: string; tick: number; minZoom?: number } | null>(null)
  // "Tout afficher" / "Vue d'ensemble": each bump re-frames the map on every pallet with a position.
  const [fitRequest, setFitRequest] = useState(0)
  const [drawerCollapsed, setDrawerCollapsed] = useState(readDrawerCollapsed)

  // A contract switch starts over on the contract's anomalies, with no anomaly located on the map. The first
  // contract resolved (null → id) is not a switch: a deep-linked selection survives the contracts' loading.
  const [viewContractId, setViewContractId] = useState(selectedId)
  if (viewContractId !== selectedId) {
    setViewContractId(selectedId)
    if (viewContractId !== null) {
      setFocus(null)
      setCardSelection(null)
      setHoveredChipId(null)
      setReveal(null)
      setHidden(new Set())
      setSnapshotReady(false)
    }
  }
  // …and the URL drops the previous contract's selection (in place: no history entry).
  const previousContract = useRef(selectedId)
  useEffect(() => {
    const previous = previousContract.current
    previousContract.current = selectedId
    if (previous !== null && previous !== selectedId) reset()
  }, [selectedId, reset])

  // Stable identity (ContractPositions re-fetches when it changes); mirrors the snapshot for the lot list.
  const load = useCallback(async (contractId: number) => {
    const positions = await fetchPulse(contractId)
    setLoaded(positions)
    setLoadedAt(new Date())
    setSnapshotReady(true)
    return positions
  }, [])

  const loadAnomalies = useCallback(
    () => (selectedId === null ? Promise.resolve([]) : fetchAnomalies(selectedId, ALL_STATUSES)),
    [selectedId],
  )
  const { state: anomalyState } = useLoad(loadAnomalies)
  const anomalyRows = useMemo(() => (anomalyState.status === 'ready' ? anomalyState.value : []), [anomalyState])

  const listView: ListView = view.kind === 'anomaly' ? view.from : view
  const selectedChipId = listView.kind === 'pallet' ? listView.chipId : null
  // A pallet that left the snapshot (refresh) drops the panel back to the contract's anomalies.
  const pallet = selectedChipId === null ? undefined : loaded.find((p) => p.chipId === selectedChipId)
  const openRow = view.kind === 'anomaly' ? anomalyRows.find((row) => row.anomalyKey === view.anomalyKey) : undefined

  // On the contract list, a marker selected through a card (or a deep-linked anomaly's pallet) opens its
  // pallet when clicked (the map reports `null` since it was already selected).
  const cardChipId =
    listView.kind === 'contract' ? (cardSelection?.chipId ?? (view.kind === 'anomaly' ? openRow?.chipId : undefined) ?? null) : null
  const selectDevice = useCallback(
    (chipId: string | null) => {
      const next = chipId ?? cardChipId
      setFocus(null)
      setCardSelection(null)
      go(next === null ? CONTRACT_VIEW : { kind: 'pallet', chipId: next })
    },
    [cardChipId, go],
  )
  const backToContract = useCallback(() => {
    setFocus(null)
    setCardSelection(null)
    go(CONTRACT_VIEW)
  }, [go])
  const showPalletAnomalies = (chipId: string) => {
    setFocus(null)
    setCardSelection(null)
    go({ kind: 'contract', chipId })
  }
  const openAnomaly = (anomalyKey: string) => {
    setHoveredChipId(null)
    go({ kind: 'anomaly', anomalyKey, from: listView })
  }
  // A card click (or Enter) opens its detail straight away, brings its pallet into view (cluster expanded
  // if needed) and keeps the card selected for when the user comes back to the list.
  const selectCard = (selection: AnomalySelection) => {
    setFocus(null)
    setCardSelection(selection)
    setReveal((previous) => ({ chipId: selection.chipId, tick: (previous?.tick ?? 0) + 1 }))
    openAnomaly(selection.anomalyKey)
  }
  const toggleDrawer = (collapsed: boolean) => {
    setHoveredChipId(null)
    setDrawerCollapsed(collapsed)
    writeDrawerCollapsed(collapsed)
  }
  const closeAnomaly = () => {
    setFocus(null)
    go(listView)
  }

  const lots = useMemo(() => {
    const byLot = new Map<string, string>()
    for (const { lot } of loaded) {
      if (!lot || byLot.has(lot.cpalLot)) continue
      const name = [lot.custLotNumber ?? lot.cpalLot, lot.productName].filter(Boolean).join(' — ')
      byLot.set(lot.cpalLot, lot.status === 'closed' ? `${name} (clôturé)` : name)
    }
    return [...byLot].sort((a, b) => a[1].localeCompare(b[1]))
  }, [loaded])

  // A lot that vanished (contract change, refresh) falls back to "all" instead of an empty map.
  const lot = lots.some(([id]) => id === lotChoice) ? lotChoice : ALL_LOTS
  const filter = useMemo(
    () => (lot === ALL_LOTS ? undefined : (p: Position) => p.lot?.cpalLot === lot),
    [lot],
  )

  // The page's one period (a preset ending at the latest load, or calendar days) filters the map by last
  // report (ContractPositions' `period`), is the pallet panel's chart range and the replay span. The map draws
  // exactly `timeline.displayed` (lot, checked pallets, then live period or replay instant); the contract
  // anomaly list follows what is inside the map's view.
  const lotPositions = useMemo(() => (filter ? loaded.filter(filter) : loaded), [loaded, filter])
  const shownPositions = useMemo(
    () => (hidden.size === 0 ? lotPositions : lotPositions.filter((p) => !hidden.has(p.chipId))),
    [lotPositions, hidden],
  )
  const timeline = usePulseTimeline({
    contractId: selectedId,
    positions: shownPositions,
    now: loadedAt,
    initialChoice: initial.choice,
    initialInstant: initial.instant,
  })
  const { range } = timeline
  const period = useMemo(() => ({ preset: 'custom' as const, ...range }), [range])

  const setShown = useCallback((chipIds: string[], shown: boolean) => {
    setHidden((previous) => {
      const next = new Set(previous)
      for (const chipId of chipIds) {
        if (shown) next.delete(chipId)
        else next.add(chipId)
      }
      return next
    })
  }, [])
  // "Localiser" / "Voir la palette →": the pallet's drawer, the map flying onto it (shown again if hidden).
  const selectChip = (chipId: string) => {
    if (hidden.has(chipId)) setShown([chipId], true)
    setFocus(null)
    setCardSelection(null)
    go({ kind: 'pallet', chipId })
    setReveal((previous) => ({ chipId, tick: (previous?.tick ?? 0) + 1, minZoom: CHIP_MIN_ZOOM }))
  }
  // Pallets "Localiser" can fly to: on the map now, or hidden but with a position in the period.
  const locatable = useMemo(() => {
    const out = new Set(timeline.mapChipIds)
    for (const p of filterByLastReport(lotPositions.filter((q) => hidden.has(q.chipId)), period)) {
      if (p.latitude !== null && p.longitude !== null) out.add(p.chipId)
    }
    return out
  }, [timeline.mapChipIds, lotPositions, hidden, period])

  // Deep link to a pallet: bring it into view once the snapshot has it.
  const revealedInitial = useRef(initial.chipId === null)
  useEffect(() => {
    if (revealedInitial.current || initial.chipId === null) return
    if (!loaded.some((p) => p.chipId === initial.chipId)) return
    revealedInitial.current = true
    setReveal((previous) => ({ chipId: initial.chipId!, tick: (previous?.tick ?? 0) + 1, minZoom: CHIP_MIN_ZOOM }))
  }, [loaded, initial.chipId])

  // The period and a paused replay instant ride in the URL (`replace`, never a history entry). The state is
  // the source of truth after arrival: back/forward to an entry with another period re-writes it, so walking
  // the selection levels never changes the period.
  const periodValue = periodParam(timeline.choice)
  const instantValue =
    timeline.instant === null ? null : timeline.playing ? undefined : String(Math.round(timeline.instant))
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const wantedPeriod = periodValue === DEFAULT_PERIOD_PARAM ? null : periodValue
    let changed = false
    if (params.get(PERIOD_PARAM) !== wantedPeriod) {
      if (wantedPeriod === null) params.delete(PERIOD_PARAM)
      else params.set(PERIOD_PARAM, wantedPeriod)
      changed = true
    }
    // While playing, the instant moves every tick: the URL keeps the last paused one until playback stops.
    if (instantValue !== undefined && params.get(INSTANT_PARAM) !== instantValue) {
      if (instantValue === null) params.delete(INSTANT_PARAM)
      else params.set(INSTANT_PARAM, instantValue)
      changed = true
    }
    if (!changed) return
    const search = params.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true, state: location.state })
  }, [periodValue, instantValue, location, navigate])

  const showAll = useCallback(() => setFitRequest((n) => n + 1), [])
  const overview = useMemo(
    () => ({ label: 'Vue d’ensemble', tooltip: 'Vue d’ensemble', icon: House, disabled: timeline.allInView }),
    [timeline.allInView],
  )
  // Re-frame the map on a lot or period choice only, never because playback moved or a pallet was hidden.
  const fitKey = `${lot}|${JSON.stringify(timeline.choice)}`

  // Replay ticks: the anomalies of the shown pallets inside the period.
  const ticks = useMemo<AnomalyTick[]>(() => {
    const shownIds = new Set(shownPositions.map((p) => p.chipId))
    const fromMs = range.from.getTime()
    const toMs = range.to.getTime()
    const out: AnomalyTick[] = []
    for (const row of anomalyRows) {
      if (!shownIds.has(row.chipId)) continue
      const at = parseUtc(row.eventDate)
      if (!at || at.getTime() < fromMs || at.getTime() > toMs) continue
      const headline = cardHeadline(anomalyCardContent(row))
      out.push({ anomalyKey: row.anomalyKey, chipId: row.chipId, at: at.getTime(), label: `${headline} · ${row.chipId} · ${formatAbsolute(at)}` })
    }
    return out
  }, [anomalyRows, shownPositions, range])
  // The top bar's freshness chip draws ContractPositions' refresh state.
  const [freshness, setFreshness] = useState<PositionsRefreshState | null>(null)
  const onMapKeyDownCapture = useTimelineKeys(timeline, 'map')
  // Every pallet unchecked in the selector: say so on the map, with the way back.
  const allHidden = lotPositions.length > 0 && shownPositions.length === 0
  const noneSelectedNotice = (
    <>
      <p>Aucune palette sélectionnée</p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShown(lotPositions.map((p) => p.chipId), true)}
        data-testid="pulse-select-all"
      >
        Tout sélectionner
      </Button>
    </>
  )
  const openTick = (tick: AnomalyTick) => {
    timeline.scrub(tick.at)
    selectCard({ anomalyKey: tick.anomalyKey, chipId: tick.chipId })
  }

  // Breadcrumb: Pulse › [pallet] › [Anomalies] › [anomaly]; every level but the last goes back to it through
  // the same navigation as the drawer's ← buttons.
  const levels: ShellBreadcrumbLevel[] = [{ label: 'Pulse', onSelect: backToContract, testId: 'breadcrumb-pulse' }]
  if (listView.chipId !== undefined) {
    const chipId = listView.chipId
    levels.push({ label: chipId, onSelect: () => go({ kind: 'pallet', chipId }), testId: 'breadcrumb-pallet' })
  }
  if (listView.kind === 'contract' && (listView.chipId !== undefined || view.kind === 'anomaly')) {
    levels.push({ label: 'Anomalies', onSelect: () => go(listView), testId: 'breadcrumb-anomalies' })
  }
  if (view.kind === 'anomaly') {
    levels.push({ label: openRow ? cardHeadline(anomalyCardContent(openRow)) : 'Anomalie', testId: 'breadcrumb-anomaly' })
  }

  // Only mount the status block when it has something to say, so nothing sits above the map.
  const hasStatusMessage =
    state === 'loading' || state === 'error' || (state === 'loaded' && contracts.length === 0) || Boolean(accessError)

  // Drawer header: the collapse control (md+), in its own row except in the pallet view's header.
  const palletShown = view.kind !== 'anomaly' && pallet !== undefined
  const collapseButton = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="ml-auto max-md:hidden"
      aria-label="Réduire le panneau des anomalies"
      title="Réduire le panneau"
      aria-expanded
      aria-controls="pulse-drawer-body"
      onClick={() => toggleDrawer(true)}
      data-testid="pulse-drawer-collapse"
    >
      <PanelRightClose aria-hidden />
    </Button>
  )

  return (
    <div className="flex flex-col page-fill-height max-md:pb-6" data-testid="pulse">
      {/* No title band: the page title is the top bar's breadcrumb; the h1 stays for assistive tech. */}
      <h1 className="sr-only">Pulse</h1>
      <ShellPageTitle>
        <ShellBreadcrumb levels={levels} />
      </ShellPageTitle>
      {selectedId !== null && (
        <ShellPageActions>
          <div className="flex items-center gap-2" data-testid="pulse-controls">
            <PalletSelector
              positions={lotPositions}
              hidden={hidden}
              onToggle={(chipId, shown) => setShown([chipId], shown)}
              onSetMany={setShown}
              onLocate={selectChip}
              locatable={locatable}
              selectedChipId={pallet?.chipId ?? cardChipId}
              lots={lots}
              lot={lot}
              onLotChange={setLotChoice}
            />
            {/* Pulse layout v2 §1: exactly two controls, the scope and the freshness; the period is in the
                timeline bar, the theme in the user menu. */}
            {freshness && (
              <PulseFreshnessChip
                timeline={timeline}
                lastUpdated={freshness.lastUpdated}
                refreshing={freshness.refreshing}
                failed={freshness.failed}
                onRefresh={freshness.refresh}
              />
            )}
          </div>
        </ShellPageActions>
      )}

      {hasStatusMessage && (
        <div className="flex flex-col gap-4 shrink-0 px-4 py-4 md:px-6">
          {state === 'loading' && (
            <div data-testid="pulse-loading" role="status">
              <Skeleton className="h-9 w-64" />
              <span className="sr-only">Chargement des contrats…</span>
            </div>
          )}

          {state === 'error' && (
            <Alert variant="danger" data-testid="pulse-error">
              Impossible de charger vos contrats. Réessayez plus tard.
            </Alert>
          )}

          {state === 'loaded' && contracts.length === 0 && (
            <Empty data-testid="pulse-empty">
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
        </div>
      )}

      {/* FR15/EC17: the map shows (with its loader) while the contract list loads, before any contract is known. */}
      {(selectedId !== null || state === 'loading') && (
        <div
          data-testid="pulse-split"
          // `isolate`: the map's Leaflet panes and controls (z 400–1000) and its overlays stay in this
          // stacking context, so the shell's popovers, nav and top-bar menus (portalled, z-50) render above them.
          // No map shadow: the map is framed by the nav rail and the drawer only, edge to edge.
          // md+: the map column takes what the drawer leaves (drawer: clamp(320px, 22vw, 400px), or a 48 px rail).
          className="isolate flex flex-col md:min-h-0 md:flex-1 md:flex-row [&_.position-map>div:first-child]:shadow-none"
        >
          {/* The map column: the map, then the timeline bar docked under it (not under the drawer). */}
          <div
            data-testid="pulse-map-column"
            className="relative flex flex-col md:min-h-0 md:min-w-0 md:flex-1"
            onKeyDownCapture={onMapKeyDownCapture}
          >
            <ContractPositions
              contractId={selectedId}
              onUnauthorized={rejectContract}
              onRefreshState={setFreshness}
              emptyNotice={allHidden ? noneSelectedNotice : undefined}
              load={load}
              filter={filter}
              period={period}
              showFleetPanel={false}
              selectedChipId={pallet?.chipId ?? cardChipId}
              onSelectDevice={selectDevice}
              focus={focus}
              highlightedChipId={hoveredChipId}
              reveal={reveal}
              mapPositions={timeline.displayed}
              trails={timeline.trails}
              // An empty period or lot keeps the map (tiles, controls, current view) with a notice on it.
              keepMapWhenEmpty
              onViewportChange={timeline.setViewport}
              fitKey={fitKey}
              loadMax={loadMax}
              fitRequest={fitRequest}
              fitControl={overview}
              markerStyle="compact"
              // A selected pallet: a click on the map background unselects it (back to the anomalies).
              onMapClick={pallet || cardChipId ? backToContract : undefined}
            />
            {snapshotReady && <PulseTimelineBar timeline={timeline} ticks={ticks} onTick={openTick} />}
          </div>

          <aside
            aria-label="Panneau latéral"
            data-testid="pulse-anomalies-cell"
            data-collapsed={drawerCollapsed}
            className={cn(
              'flex flex-col border-t border-border bg-card md:min-h-0 md:shrink-0 md:overflow-hidden md:border-t-0 md:border-l md:transition-all md:duration-200',
              drawerCollapsed ? 'md:w-12' : 'pulse-drawer-width',
            )}
          >
            {drawerCollapsed && (
              <div className="hidden md:flex">
                {/* A pallet open in the drawer: its latest values; otherwise the open-anomaly count. */}
                {selectedId === null ? null : palletShown ? (
                  <PalletRail position={pallet} onExpand={() => toggleDrawer(false)} />
                ) : (
                  <AnomaliesRail contractId={selectedId} visibleChipIds={timeline.visibleChipIds} onExpand={() => toggleDrawer(false)} />
                )}
              </div>
            )}
            <div
              id="pulse-drawer-body"
              data-testid="pulse-drawer-body"
              className={cn('flex min-w-0 flex-col md:min-h-0 md:flex-1', drawerCollapsed && 'md:hidden')}
            >
              {/* The pallet and anomaly views put the collapse control in their own header row (compact header). */}
              {!palletShown && view.kind !== 'anomaly' && (
                <div className="flex items-center justify-between gap-2 px-4 pt-3 max-md:pt-4">
                  {view.kind === 'contract' && <h2 className="text-base font-semibold">Anomalies</h2>}
                  {collapseButton}
                </div>
              )}
              <div
                className={cn(
                  'flex min-w-0 flex-col overflow-x-hidden overflow-y-auto p-4 pt-3 md:min-h-0 md:flex-1',
                  (palletShown || view.kind === 'anomaly') && 'pt-2',
                )}
              >
                {selectedId === null ? (
                  <SkeletonRows label="Chargement des anomalies…" rows={4} className="gap-4" testId="pulse-drawer-loading" />
                ) : view.kind === 'anomaly' ? (
                  <AnomalyDetailView
                    contractId={selectedId}
                    anomalyKey={view.anomalyKey}
                    onBack={closeAnomaly}
                    onLocate={setFocus}
                    // "Voir la palette →": the pallet's drawer, the map flying onto it (as "Localiser").
                    onShowPallet={selectChip}
                    actions={
                      <>
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link
                            to={alertPath(view.anomalyKey)}
                            aria-label="Ouvrir en pleine page"
                            title="Ouvrir en pleine page"
                            data-testid="pulse-anomaly-fullpage"
                          >
                            <Maximize2 aria-hidden />
                          </Link>
                        </Button>
                        {collapseButton}
                      </>
                    }
                  />
                ) : pallet ? (
                  <PalletPanel
                    contractId={selectedId}
                    position={pallet}
                    range={range}
                    onBack={backToContract}
                    onOpenAnomaly={openAnomaly}
                    onShowAnomalies={() => showPalletAnomalies(pallet.chipId)}
                    actions={collapseButton}
                  />
                ) : listView.kind === 'contract' && listView.chipId !== undefined ? (
                  // Pallet filter (from the pallet panel's link): that pallet's anomalies, wherever the map is.
                  <div data-testid="pulse-pallet-anomalies" className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                      <span className="truncate text-muted-foreground" data-testid="pulse-anomalies-chip-filter">
                        Palette {listView.chipId}
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto shrink-0 p-0"
                        onClick={backToContract}
                        data-testid="pulse-anomalies-chip-clear"
                      >
                        Toutes les palettes
                      </Button>
                    </div>
                    <ContractAnomalies
                      contractId={selectedId}
                      chipId={listView.chipId}
                      selectedKey={cardSelection?.anomalyKey ?? null}
                      onSelect={selectCard}
                      onHover={setHoveredChipId}
                      onOpen={openAnomaly}
                    />
                  </div>
                ) : (
                  <div data-testid="pulse-contract-anomalies" className="flex min-w-0 flex-col gap-4">
                    <ContractAnomalies
                      contractId={selectedId}
                      visibleChipIds={timeline.visibleChipIds}
                      mapChipIds={timeline.mapChipIds}
                      onShowAll={showAll}
                      selectedKey={cardSelection?.anomalyKey ?? null}
                      onSelect={selectCard}
                      onHover={setHoveredChipId}
                      onOpen={openAnomaly}
                    />
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
