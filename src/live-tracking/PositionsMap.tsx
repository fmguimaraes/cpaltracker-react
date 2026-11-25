import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import type { Position } from '../api/positions'
import { FleetMap, type FleetMapFitControl, type FleetMapTrack, type MapDevice, type MapLabels, type MapTrail, type MapViewport } from '@/ui/map'
import { cn } from '@/lib/utils'
import { STATE_LABEL } from './fleetModel'
import { massStatus } from './markerStyle'
import { Droplet, Thermometer, Weight, Zap, type LucideIcon } from 'lucide-react'
import { formatPositionCard, type TooltipMetricKey } from './positionTooltip'
import { LoadLegend } from './LoadLegend'
import { loadLevel } from './loadScale'

/**
 * KAN-160 (FR3/FR4) + FR8 — one kit `FleetMap` marker per positioned device
 * (state ring from the mass thresholds, clusters, zoom/fit/layers, themed
 * tiles and the kit's inline notice when tiles fail to load).
 *
 * The kit marker has no tooltip, so the detail card of the hovered, focused
 * or selected marker is rendered here as a themed overlay (NFR7: still
 * keyboard reachable, since the kit marker is focusable). Markers are
 * recognised through the `data-marker-id` attribute the kit sets.
 *
 * Language: the page is French, the kit defaults are English, so every kit
 * string is overridden through `labels` (states come from `STATE_LABEL`).
 */
const MAP_LABELS: MapLabels = {
  region: 'Carte de la flotte',
  zoomIn: 'Zoom avant',
  zoomOut: 'Zoom arrière',
  fit: 'Afficher tous les appareils',
  layers: 'Couches de la carte',
  basemap: 'Fond de carte',
  clusters: 'Regroupements',
  tilesFailed: 'Les tuiles de la carte n’ont pas pu être chargées. Les marqueurs restent exacts.',
  status: STATE_LABEL,
  cluster: (count, worst) => `${count} appareils, pire état : ${worst}`,
}



/** Devices without a usable `latitude`/`longitude` never produce a marker
 * (FR3/FR4's "unpositioned devices produce no marker") — `HasPosition=1`
 * already guarantees this server-side (`tracking_logic.php`), but a
 * missing coordinate is still checked defensively rather than assumed. */
function hasCoordinates(position: Position): position is Position & { latitude: number; longitude: number } {
  return position.latitude !== null && position.longitude !== null
}

function markerIdOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('.leaflet-marker-icon')?.getAttribute('data-marker-id') ?? null
}

export function PositionsMap({
  positions,
  className,
  selectedChipId,
  onSelectDevice,
  focus,
  highlightedChipId,
  reveal,
  onViewportChange,
  fitKey,
  anchorTooltip = false,
  loadMax,
  fitRequest,
  fitControl,
  markerStyle,
  onMapClick,
  trails,
  emptyFit,
}: {
  positions: Position[]
  className?: string
  /** Pulse: controlled marker selection (`undefined` keeps the internal one, as on Live Tracking). */
  selectedChipId?: string | null
  /** Pulse: told the new selection on every marker click (`null` when the selected marker is clicked again). */
  onSelectDevice?: (chipId: string | null) => void
  /** Pulse: a point to zoom the map onto and mark (an anomaly's position); `null`/absent = none. */
  focus?: { lat: number; lng: number } | null
  /** Pulse: the device an anomaly card is hovered for (marker emphasised, its card shown); absent = none. */
  highlightedChipId?: string | null
  /**
   * Pulse: pan/zoom onto this device (expanding its cluster) whenever `tick` changes; with `minZoom`, fly
   * there keeping the zoom if at least `minZoom` (kit `reveal`). Absent = never.
   */
  reveal?: { chipId: string; tick: number; minZoom?: number } | null
  /** Pulse: told the map's visible bounds on mount and after every pan/zoom (kit `onViewportChange`). */
  onViewportChange?: (viewport: MapViewport) => void
  /** Pulse: auto-frame only when this key changes (kit `fitKey`); absent = on every device-set change. */
  fitKey?: string
  /** Pulse: show the detail card next to its marker instead of in the map's corner (Live Tracking's default). */
  anchorTooltip?: boolean
  /**
   * Pulse: colour markers by remaining load relative to this weight ("charge pleine") and show the
   * legend; absent = the state colours (Live Tracking).
   */
  loadMax?: number | null
  /** Pulse: bump to frame every device (kit `fitRequest`). */
  fitRequest?: number
  /** Pulse: fit control overrides (kit `fitControl`); absent = the default fit button (Live Tracking). */
  fitControl?: FleetMapFitControl
  /** Pulse: kit marker style; absent = the default pills (Live Tracking). */
  markerStyle?: 'pill' | 'compact'
  /** Pulse: click on the map background (kit `onMapClick`). */
  onMapClick?: () => void
  /** Pulse playback: paths travelled so far, drawn under the markers (kit `trails`); absent = none. */
  trails?: MapTrail[]
  /** Pulse: points to frame while there is no marker and nothing was framed yet (kit `emptyFit`). */
  emptyFit?: Array<[number, number]>
}) {
  const positioned = useMemo(() => positions.filter(hasCoordinates), [positions])
  const devices = useMemo<MapDevice[]>(
    () =>
      positioned.map((p) => ({
        id: p.chipId,
        name: p.chipId,
        status: massStatus(p.mass),
        ...(loadMax === undefined ? {} : { load: loadLevel(p.mass, loadMax) ?? undefined }),
        lat: p.latitude,
        lng: p.longitude,
      })),
    [positioned, loadMax],
  )
  const [ownSelectedId, setOwnSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const selectedId = selectedChipId === undefined ? ownSelectedId : selectedChipId

  const onSelect = useCallback(
    (id: string) => {
      const next = id === selectedId ? null : id
      if (selectedChipId === undefined) setOwnSelectedId(next)
      onSelectDevice?.(next)
    },
    [selectedId, selectedChipId, onSelectDevice],
  )

  // The focus point goes through the kit's track layer (a single point, no trail): it frames the point
  // (fitBounds, capped at zoom 14) whenever `fitTick` grows, and draws a dot there. A new point bumps the tick.
  const [shownFocus, setShownFocus] = useState(focus)
  const [focusTick, setFocusTick] = useState(focus ? 1 : 0)
  if (focus !== shownFocus) {
    setShownFocus(focus)
    if (focus) setFocusTick((t) => t + 1)
  }
  const track = useMemo<FleetMapTrack | undefined>(
    () => (focus ? { points: [{ t: '', lat: focus.lat, lng: focus.lng }], index: 0, showTrail: false, fitTick: focusTick } : undefined),
    [focus, focusTick],
  )

  const revealId = reveal?.chipId
  const revealTick = reveal?.tick
  const revealMinZoom = reveal?.minZoom
  const kitReveal = useMemo(
    () =>
      revealId === undefined || revealTick === undefined
        ? null
        : { id: revealId, tick: revealTick, ...(revealMinZoom === undefined ? {} : { minZoom: revealMinZoom }) },
    [revealId, revealTick, revealMinZoom],
  )

  // Memoised on purpose: a hover/focus change must not re-render the kit map, or the
  // cluster layer re-adds its markers and the focused marker element is replaced.
  // (`highlightedChipId` comes from outside the map — a card hover — so it may re-render it.)
  const map = useMemo(
    () => (
      <FleetMap
        devices={devices}
        track={track}
        selectedId={selectedId}
        onSelect={onSelect}
        height="100%"
        className="rounded-none"
        labels={MAP_LABELS}
        highlightedId={highlightedChipId ?? null}
        reveal={kitReveal}
        onViewportChange={onViewportChange}
        fitKey={fitKey}
        fitRequest={fitRequest}
        fitControl={fitControl}
        markerStyle={markerStyle}
        onMapClick={onMapClick}
        trails={trails}
        emptyFit={emptyFit}
      />
    ),
    [devices, track, selectedId, onSelect, highlightedChipId, kitReveal, onViewportChange, fitKey, fitRequest, fitControl, markerStyle, onMapClick, trails, emptyFit],
  )

  const shown = positioned.find((p) => p.chipId === (activeId ?? highlightedChipId ?? selectedId))
  const shownId = shown?.chipId ?? null
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  // Anchored mode: keep the card beside its marker element, following pans/zooms (Leaflet moves the map
  // pane and the markers through their `style`). No marker element: hidden until there is one.
  // All four offsets are written together, imperatively, so the card is never stretched between a
  // corner (right/bottom) and an anchor (left/top) for a frame while React catches up.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!anchorTooltip || !container || shownId === null) return
    const gap = 12
    const set = (card: HTMLElement, pos: { left: string; top: string; right: string; bottom: string }) => {
      // Only write on change: the card's own style is inside the observed subtree.
      for (const side of ['left', 'top', 'right', 'bottom'] as const) {
        if (card.style[side] !== pos[side]) card.style[side] = pos[side]
      }
      if (card.style.visibility) card.style.visibility = ''
    }
    const place = () => {
      const card = cardRef.current
      if (!card) return
      const id = CSS.escape(shownId)
      // The marker itself, or — when it is grouped — the cluster the kit tagged as holding it.
      const marker =
        container.querySelector(`.leaflet-marker-icon[data-marker-id="${id}"]`) ??
        container.querySelector(`[data-cluster-for="${id}"]`)
      // No marker element yet (icon being swapped on hover/highlight, or off-screen): keep the card hidden
      // rather than flashing it in a corner; the observer places it as soon as the element is there.
      if (!marker) {
        if (card.style.visibility !== 'hidden') card.style.visibility = 'hidden'
        card.removeAttribute('data-anchored')
        return
      }
      const box = container.getBoundingClientRect()
      const pin = marker.getBoundingClientRect()
      // Above the anchor, centred on it; below it when there is no room above.
      const left = pin.left - box.left + pin.width / 2 - card.offsetWidth / 2
      const above = pin.top - box.top - gap - card.offsetHeight
      const top = above >= gap ? above : pin.bottom - box.top + gap
      set(card, {
        left: `${Math.round(Math.min(Math.max(gap, left), box.width - card.offsetWidth - gap))}px`,
        top: `${Math.round(Math.min(Math.max(gap, top), box.height - card.offsetHeight - gap))}px`,
        right: '',
        bottom: '',
      })
      card.setAttribute('data-anchored', 'true')
    }
    place()
    const observer = new MutationObserver(place)
    observer.observe(container, { attributes: true, attributeFilter: ['style', 'class'], subtree: true, childList: true })
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [anchorTooltip, shownId])

  return (
    // `isolate`: the Leaflet panes and controls (z 400–1000) stay inside this stacking context, so the
    // shell's portalled menus and popovers (z-50: user menu, top-bar popovers) always render above the map.
    <div
      ref={containerRef}
      className={cn('position-map relative isolate size-full', className)}
      data-testid="positions-map"
      onFocus={(e: FocusEvent) => setActiveId(markerIdOf(e.target))}
      onBlur={() => setActiveId(null)}
      onMouseOver={(e: MouseEvent) => setActiveId(markerIdOf(e.target))}
      // Moving between a marker's own parts (dot ↔ label) fires out/over pairs: follow where the pointer
      // went instead of clearing, so the card is not unmounted and remounted on every crossing.
      onMouseOut={(e: MouseEvent) => setActiveId(markerIdOf(e.relatedTarget))}
    >
      {map}
      {/* Pulse (load-coloured markers): the colour ramp stays visible over the map, bottom-left. */}
      {loadMax !== undefined && <LoadLegend className="pointer-events-none absolute bottom-3 left-3 z-1000" />}
      {shown && (
        <div
          ref={cardRef}
          role="tooltip"
          data-testid={`marker-tooltip-${shown.chipId}`}
          className={cn(
            'leaflet-tooltip pointer-events-none z-1000 !rounded-lg !border-border !bg-card !p-3 !text-card-foreground shadow-overlay',
            // Anchored mode positions the card itself (see the layout effect); never mix in corner classes.
            !anchorTooltip && 'right-3 bottom-3 md:right-16 md:bottom-8',
          )}
        >
          <PositionCardContent position={shown} />
        </div>
      )}
    </div>
  )
}

const METRIC_ICON: Record<TooltipMetricKey, LucideIcon> = {
  temperature: Thermometer,
  humidity: Droplet,
  acceleration: Zap,
  weight: Weight,
}

/** The marker card (Pulse layout v2 §4): title, local time, position, then the readings as a 2 × 2 grid. */
function PositionCardContent({ position }: { position: Position }) {
  const card = formatPositionCard(position)
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs tabular-nums">
      <p className="text-sm font-semibold" data-testid="marker-tooltip-title">
        {card.title}
      </p>
      {card.when && <p data-testid="marker-tooltip-when">{card.when}</p>}
      {card.place && (
        <p className="text-muted-foreground" data-testid="marker-tooltip-place">
          {card.place}
        </p>
      )}
      {card.metrics.length > 0 && (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1" data-testid="marker-tooltip-metrics">
          {card.metrics.map((metric) => {
            const Icon = METRIC_ICON[metric.key]
            return (
              <div key={metric.key} className="flex items-center gap-1 whitespace-nowrap" data-testid={`marker-tooltip-${metric.key}`}>
                <dt>
                  <Icon aria-hidden className="size-3.5 text-muted-foreground" />
                  <span className="sr-only">{metric.label}</span>
                </dt>
                <dd>{metric.value}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
