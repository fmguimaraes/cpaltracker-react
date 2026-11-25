import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode, type RefObject, type SVGProps } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { Layers, Maximize2, Minus, Plus, TriangleAlert } from 'lucide-react'
import { DEFAULT_MAP_LABELS, type MapDevice as Device, type MapDeviceStatus as DeviceStatus, type MapLabels, type MapLoadLevel, type MapTrail, type MapViewport, type TrackPoint } from './types'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Switch } from '@/ui/switch'
import { Label } from '@/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/utils'
import { useChartTheme } from '@/ui/charts/use-chart-theme'
import { clusterIcon, worstStatus } from './markers'
import { DeviceMarker } from './DeviceMarker'
import { useBasemap } from '@/ui/map/basemap'

/** Recorded track to draw under the markers; driven by `useTrackPlayback` (K-8). */
export interface FleetMapTrack {
  points: TrackPoint[]
  /** Index of the current position. */
  index: number
  /** Draw the trail up to `index` (otherwise only the position dot). */
  showTrail: boolean
  /** Bump to frame the whole track. */
  fitTick: number
}

/**
 * Optional overrides of the fit control (the button under the zoom +/−). Absent = the default button
 * (`labels.fit`, maximise icon, always enabled, no tooltip).
 */
export interface FleetMapFitControl {
  /** Accessible name; defaults to `labels.fit`. */
  label?: string
  /** Shown in a tooltip on hover/focus (also while disabled). */
  tooltip?: string
  /** E.g. while every device is already in view. */
  disabled?: boolean
  icon?: ComponentType<SVGProps<SVGSVGElement>>
}

export interface FleetMapProps {
  /** Any object with id, name, status, lat, lng (mock `Device` satisfies it). */
  devices: Device[]
  /** Optional recorded track + playback position. */
  track?: FleetMapTrack
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Device ids to frame; defaults to all devices. */
  fitTo?: string[]
  /** Map height (any CSS length, e.g. '480px'). */
  height?: number | string
  className?: string
  /** Visible/aria strings; defaults to English. */
  labels?: MapLabels
  /** Optional hover cue: this device's marker is emphasised (e.g. while a list row points at it). */
  highlightedId?: string | null
  /**
   * Optional: bring this device into view — pan/zoom onto it, expanding its cluster when it is inside
   * one. Runs whenever `tick` changes (so the same device can be revealed again).
   */
  reveal?: FleetMapReveal | null
  /** Optional: told the visible bounds once mounted and after every pan/zoom/resize (unchanged bounds are not re-sent). */
  onViewportChange?: (viewport: MapViewport) => void
  /**
   * Optional: when set, the map auto-frames its devices only when this key changes (or the first time it
   * has any), not whenever the set of device ids changes — e.g. so hiding a device or a playback step
   * does not move the map. Absent = frame on every id-set change, as before.
   */
  fitKey?: string
  /**
   * Optional: bump to frame every device from outside the map (same as the fit control: fitBounds,
   * 48 px padding, animated). `0`/absent = never.
   */
  fitRequest?: number
  /** Optional fit control overrides (label, tooltip, disabled state, icon). */
  fitControl?: FleetMapFitControl
  /** Optional: called on a click on the map background (not on a marker, a cluster or after a drag). */
  onMapClick?: () => void
  /**
   * Optional marker style. `pill` (default): icon + device id label. `compact`: the id label next to a
   * load/state dot, without the truck icon and with tighter padding.
   */
  markerStyle?: 'pill' | 'compact'
  /**
   * Optional: paths already travelled (e.g. during a playback), one polyline per trail under the markers,
   * in the theme's primary colour. A trail needs two points at least. Absent/empty = none.
   */
  trails?: MapTrail[]
  /**
   * Optional: `[lat, lng]` points to frame when there is no device to frame and the map has not been framed
   * yet (e.g. a period that leaves no device: the map opens on where they last were). Absent = the default
   * centre. Once framed, an empty device list keeps the current view.
   */
  emptyFit?: Array<[number, number]>
  /**
   * Optional content appended to the layers control's popover (⧉), under the basemap/cluster switches — e.g.
   * the app's marker legend, so no legend card floats over the map. Absent = switches only.
   */
  layersExtra?: ReactNode
}

/**
 * A reveal request. Default: jump onto the device at zoom 14 at least (expanding its cluster). With
 * `minZoom`: fly there, keeping the current zoom when it is at least `minZoom` (else zooming to it), and
 * only expand the device's cluster if it is still grouped at that zoom.
 */
export interface FleetMapReveal {
  id: string
  tick: number
  minZoom?: number
}

/** The `leaflet.markercluster` group methods used here (the plugin ships no types). */
interface ClusterGroupLike {
  refreshClusters(): void
  getLayers(): L.Layer[]
  getVisibleParent(marker: L.Marker): L.Layer | null
  zoomToShowLayer(marker: L.Marker, callback?: () => void): void
  on(type: string, fn: () => void): void
  off(type: string, fn: () => void): void
  once(type: string, fn: () => void): void
  /** Private plugin flag, set while a zoom re-cluster animation runs. */
  _inZoomAnimation?: number
}

interface ClusterLike {
  getAllChildMarkers(): L.Marker[]
  getChildCount(): number
}


function boundsOf(list: Device[]) {
  return list.length ? L.latLngBounds(list.map((d) => [d.lat, d.lng] as [number, number])) : null
}

function Controls({
  fit,
  showTiles,
  setShowTiles,
  clusters,
  setClusters,
  labels,
  fitControl,
  layersExtra,
}: {
  labels: MapLabels
  fitControl?: FleetMapFitControl
  layersExtra?: ReactNode
  fit: () => void
  showTiles: boolean
  setShowTiles: (v: boolean) => void
  clusters: boolean
  setClusters: (v: boolean) => void
}) {
  const map = useMap()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current)
      L.DomEvent.disableScrollPropagation(ref.current)
    }
  }, [])
  return (
    <div ref={ref} className="absolute top-3 right-3 z-[1000] flex flex-col gap-px overflow-hidden rounded-md border border-border bg-border shadow-overlay">
      {/* Theming spec 2026-11-25: one vertical group, elevated surface, 1 px border */}
      <div className="contents">
        <Button variant="secondary" size="icon-sm" className="max-md:size-11 rounded-none bg-popover text-foreground hover:bg-muted" aria-label={labels.zoomIn} onClick={() => map.zoomIn()}>
          <Plus />
        </Button>
        <Button variant="secondary" size="icon-sm" className="max-md:size-11 rounded-none bg-popover text-foreground hover:bg-muted" aria-label={labels.zoomOut} onClick={() => map.zoomOut()}>
          <Minus />
        </Button>
      </div>
      {fitControl ? (
        <FitButton fit={fit} label={fitControl.label ?? labels.fit} {...fitControl} />
      ) : (
        <Button variant="secondary" size="icon-sm" className="max-md:size-11 rounded-none bg-popover text-foreground hover:bg-muted" aria-label={labels.fit} onClick={fit}>
          <Maximize2 />
        </Button>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="icon-sm" className="max-md:size-11 rounded-none bg-popover text-foreground hover:bg-muted" aria-label={labels.layers}>
            <Layers />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 gap-3">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="map-basemap">{labels.basemap}</Label>
            <Switch id="map-basemap" checked={showTiles} onCheckedChange={setShowTiles} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="map-clusters">{labels.clusters}</Label>
            <Switch id="map-clusters" checked={clusters} onCheckedChange={setClusters} />
          </div>
          {layersExtra && <div className="border-t border-border pt-3" data-slot="map-layers-extra">{layersExtra}</div>}
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** The fit control with overrides; the tooltip sits on a wrapper so it still shows while the button is disabled. */
function FitButton({
  fit,
  label,
  tooltip,
  disabled = false,
  icon: Icon = Maximize2,
}: FleetMapFitControl & { fit: () => void; label: string }) {
  const button = (
    <Button
      variant="secondary"
      size="icon-sm"
      className="max-md:size-11 shadow-overlay"
      aria-label={label}
      disabled={disabled}
      onClick={fit}
      data-testid="map-fit"
    >
      <Icon />
    </Button>
  )
  if (!tooltip) return button
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex rounded-md">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="left">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** `fitted` marker of a frame on `emptyFit`: never equal to a `fitKey`, so the first devices still get framed. */
const EMPTY_FIT = Symbol('empty-fit')

function Fitter({
  list,
  trigger,
  fitKey,
  emptyFit,
}: {
  list: Device[]
  trigger: number
  fitKey?: string
  emptyFit?: Array<[number, number]>
}) {
  const map = useMap()
  const key = fitKey === undefined ? list.map((d) => d.id).join(',') : `${fitKey}|${list.length > 0}`
  // With `fitKey`: frame once per key (as soon as there is something to frame), plus on every fit request.
  const fitted = useRef<{ key: string | undefined | typeof EMPTY_FIT; trigger: number } | null>(null)
  useEffect(() => {
    const done = fitted.current
    if (fitKey !== undefined && done && done.key === fitKey && done.trigger === trigger) return
    const b = boundsOf(list)
    if (!b) {
      // Nothing to frame: keep the current view, or — never framed yet — open on `emptyFit` when given.
      if (done || !emptyFit?.length) return
      map.fitBounds(L.latLngBounds(emptyFit), { padding: [48, 48], maxZoom: 14, animate: false })
      fitted.current = { key: EMPTY_FIT, trigger }
      return
    }
    map.fitBounds(b, { padding: [48, 48], maxZoom: 14, animate: trigger > 0 })
    fitted.current = { key: fitKey, trigger }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, trigger])
  return null
}

/** Reports the visible bounds on mount and at the end of every move/zoom/resize; identical bounds are skipped. */
function BackgroundClickHandler({ onClick }: { onClick: () => void }) {
  const map = useMap()
  const ref = useRef(onClick)
  useEffect(() => {
    ref.current = onClick
  })
  useEffect(() => {
    const handle = () => ref.current()
    map.on('click', handle)
    return () => {
      map.off('click', handle)
    }
  }, [map])
  return null
}

function ViewportReporter({ onChange }: { onChange: (viewport: MapViewport) => void }) {
  const map = useMap()
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  useEffect(() => {
    let last = ''
    const report = () => {
      const b = map.getBounds()
      const viewport = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
      const key = [viewport.north, viewport.south, viewport.east, viewport.west].map((n) => n.toFixed(6)).join(',')
      if (key === last) return
      last = key
      onChangeRef.current(viewport)
    }
    report()
    map.on('moveend resize', report)
    return () => {
      map.off('moveend resize', report)
    }
  }, [map])
  return null
}

/** `trails`: one non-interactive polyline per path, themed like the History timeline map's trails. */
function TrailLayer({ trails }: { trails: MapTrail[] }) {
  const chartTheme = useChartTheme()
  return (
    <>
      {trails
        .filter((trail) => trail.points.length > 1)
        .map((trail) => (
          <Polyline
            key={`trail-${trail.id}`}
            positions={trail.points}
            interactive={false}
            pathOptions={{ color: chartTheme.primary, weight: chartTheme.theme === 'light' ? 4 : 3, opacity: 1 }}
          />
        ))}
    </>
  )
}

function TrackLayer({ track }: { track: FleetMapTrack }) {
  const map = useMap()
  const { points, index, showTrail, fitTick } = track
  useEffect(() => {
    if (fitTick > 0 && points.length) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 14 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitTick])
  const current = points[Math.min(index, points.length - 1)]
  if (!current) return null
  const trail = points.slice(0, index + 1).map((p) => [p.lat, p.lng] as [number, number])
  return (
    <>
      {showTrail && trail.length > 1 && (
        <Polyline positions={trail} interactive={false} className="fill-none stroke-chart-2 stroke-[3]" />
      )}
      <CircleMarker
        center={[current.lat, current.lng]}
        radius={8}
        interactive={false}
        className="fill-foreground stroke-card stroke-[3]"
        fillOpacity={1}
      />
    </>
  )
}

/** Zoom a revealed device is shown at, at least (the same cap `Fitter` uses). */
const REVEAL_ZOOM = 14

function Revealer({
  reveal,
  devices,
  groupRef,
  clusters,
}: {
  reveal: FleetMapReveal
  devices: Device[]
  groupRef: RefObject<ClusterGroupLike | null>
  clusters: boolean
}) {
  const map = useMap()
  // The latest devices, read when a reveal is asked for (a device list refresh alone must not re-run it).
  const devicesRef = useRef(devices)
  useEffect(() => {
    devicesRef.current = devices
  })
  const { id, tick, minZoom } = reveal
  useEffect(() => {
    const device = devicesRef.current.find((d) => d.id === id)
    if (!device) return
    const group = clusters ? groupRef.current : null
    const findLayer = () =>
      group?.getLayers().find((l) => (l.options as { deviceId?: string }).deviceId === id) as L.Marker | undefined
    if (minZoom !== undefined) {
      // Fly there; once settled (re-cluster animation included), expand the cluster still holding it, if any.
      const settle = () => {
        if (!group) return
        if (group._inZoomAnimation) {
          group.once('animationend', settle)
          return
        }
        const layer = findLayer()
        if (layer && group.getVisibleParent(layer) !== layer) group.zoomToShowLayer(layer)
      }
      map.once('moveend', settle)
      map.flyTo([device.lat, device.lng], Math.max(map.getZoom(), minZoom))
      return () => {
        map.off('moveend', settle)
        group?.off('animationend', settle)
      }
    }
    const layer = findLayer()
    if (group && layer && group.getVisibleParent(layer) !== layer) {
      // Clustered (or off screen): the cluster plugin zooms in until the marker stands alone, or spiderfies.
      group.zoomToShowLayer(layer)
    } else {
      map.setView([device.lat, device.lng], Math.max(map.getZoom(), REVEAL_ZOOM))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, tick, minZoom])
  return null
}

/** Classes put on the cluster icon that currently holds the highlighted device (same cue as a marker). */
const CLUSTER_HIGHLIGHT = ['rounded-full', 'outline-2', 'outline-offset-2', 'outline-ring']

/**
 * A highlighted device hidden inside a cluster: emphasise that cluster's icon and tag it with
 * `data-cluster-for="<id>"`, so the app can anchor its hover card on it. Re-run after every re-cluster
 * (zoom, animation, layer changes), since the plugin rebuilds cluster icons then.
 */
function ClusterHighlighter({ id, groupRef }: { id: string; groupRef: RefObject<ClusterGroupLike | null> }) {
  const map = useMap()
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    let marked: HTMLElement | null = null
    const clear = () => {
      if (!marked) return
      marked.classList.remove(...CLUSTER_HIGHLIGHT)
      marked.removeAttribute('data-cluster-for')
      marked.style.zIndex = marked.dataset.prevZ ?? ''
      delete marked.dataset.prevZ
      marked = null
    }
    const mark = () => {
      clear()
      const layer = group
        .getLayers()
        .find((l) => (l.options as { deviceId?: string }).deviceId === id) as L.Marker | undefined
      const parent = layer ? group.getVisibleParent(layer) : null
      if (!parent || parent === layer) return
      const el = (parent as L.Marker).getElement?.()
      if (!el) return
      el.classList.add(...CLUSTER_HIGHLIGHT)
      el.setAttribute('data-cluster-for', id)
      el.dataset.prevZ = el.style.zIndex
      el.style.zIndex = '10000'
      marked = el
    }
    mark()
    map.on('zoomend moveend', mark)
    group.on('animationend', mark)
    group.on('layeradd', mark)
    return () => {
      map.off('zoomend moveend', mark)
      group.off('animationend', mark)
      group.off('layeradd', mark)
      clear()
    }
  }, [map, id, groupRef])
  return null
}

function Resizer() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

export function FleetMap({
  devices,
  track,
  selectedId,
  onSelect,
  fitTo,
  height = 480,
  className,
  labels = DEFAULT_MAP_LABELS,
  highlightedId = null,
  reveal = null,
  onViewportChange,
  fitKey,
  fitRequest = 0,
  fitControl,
  markerStyle = 'pill',
  onMapClick,
  trails,
  emptyFit,
  layersExtra,
}: FleetMapProps) {
  const [showTiles, setShowTiles] = useState(true)
  const [clusters, setClusters] = useState(true)
  const basemap = useBasemap()
  const [tiles, setTiles] = useState({ ok: 0, err: 0 })
  const tileError = tiles.ok === 0 && tiles.err >= 3
  const [fitTick, setFitTick] = useState(0)

  const fitList = useMemo(() => {
    const sub = fitTo?.length ? devices.filter((d) => fitTo.includes(d.id)) : devices
    return sub.length ? sub : devices
  }, [devices, fitTo])

  const groupRef = useRef<ClusterGroupLike | null>(null)
  const statusKey = devices.map((d) => `${d.id}:${d.status}:${d.load ?? ''}`).join(',')
  // Cluster icons are only rebuilt on re-cluster; force it when any device state changes.
  useEffect(() => {
    groupRef.current?.refreshClusters()
  }, [statusKey])

  const markers = devices.map((d) => (
    <DeviceMarker
      key={`${d.id}:${d.status}:${d.series ?? ''}:${d.load ?? ''}`}
      device={d}
      selected={d.id === selectedId}
      highlighted={d.id === highlightedId}
      onSelect={onSelect}
      labels={labels}
      compact={markerStyle === 'compact'}
    />
  ))

  return (
    <div
      role="region"
      aria-label={labels.region}
      className={cn('relative overflow-hidden rounded-lg bg-media shadow-media', className)}
      style={{ height }}
    >
      <MapContainer
        center={[39.5, -8]}
        zoom={6}
        zoomControl={false}
        className="size-full"
      >
        {showTiles && (
          <TileLayer
            url={basemap.url}
            attribution={basemap.attribution}
            eventHandlers={{
              tileerror: () => setTiles((t) => ({ ...t, err: t.err + 1 })),
              tileload: () => setTiles((t) => (t.ok ? t : { ...t, ok: 1 })),
            }}
          />
        )}
        {/* Polylines sit in Leaflet's overlay pane, under the marker pane, whatever the order here. */}
        {trails && trails.length > 0 && <TrailLayer trails={trails} />}
        {clusters ? (
          <MarkerClusterGroup
            ref={groupRef}
            chunkedLoading
            showCoverageOnHover={false}
            maxClusterRadius={50}
            iconCreateFunction={(c: ClusterLike) => {
              const children = c.getAllChildMarkers().map((m) => m.options as { status?: DeviceStatus; load?: MapLoadLevel })
              const worst = worstStatus(children.map((o) => o.status ?? 'ok'))
              const loads = children.map((o) => o.load).filter((l): l is MapLoadLevel => l !== undefined)
              const load = loads.length ? (Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) as MapLoadLevel) : undefined
              return clusterIcon(c.getChildCount(), worst, labels.cluster(c.getChildCount(), labels.status[worst]), load)
            }}
          >
            {markers}
          </MarkerClusterGroup>
        ) : (
          markers
        )}
        {track && <TrackLayer track={track} />}
        <Fitter list={fitList} trigger={fitTick + fitRequest} fitKey={fitKey} emptyFit={emptyFit} />
        <Resizer />
        {onMapClick && <BackgroundClickHandler onClick={onMapClick} />}
        {onViewportChange && <ViewportReporter onChange={onViewportChange} />}
        {reveal && <Revealer reveal={reveal} devices={devices} groupRef={groupRef} clusters={clusters} />}
        {clusters && highlightedId && <ClusterHighlighter key={statusKey} id={highlightedId} groupRef={groupRef} />}
        <Controls
          fit={() => setFitTick((t) => t + 1)}
          showTiles={showTiles}
          setShowTiles={(v) => {
            setTiles({ ok: 0, err: 0 })
            setShowTiles(v)
          }}
          clusters={clusters}
          setClusters={setClusters}
          labels={labels}
          fitControl={fitControl}
          layersExtra={layersExtra}
        />
      </MapContainer>
      {tileError && showTiles && (
        <div
          role="status"
          className="absolute bottom-8 left-3 z-[1000] flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-md bg-card px-3 py-2 text-sm text-foreground shadow-overlay"
        >
          <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          {labels.tilesFailed}
        </div>
      )}
    </div>
  )
}
