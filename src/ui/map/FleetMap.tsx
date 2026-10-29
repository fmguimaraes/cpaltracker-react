import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { Layers, Maximize2, Minus, Plus, TriangleAlert } from 'lucide-react'
import { DEFAULT_MAP_LABELS, type MapDevice as Device, type MapDeviceStatus as DeviceStatus, type MapLabels, type TrackPoint } from './types'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Switch } from '@/ui/switch'
import { Label } from '@/ui/label'
import { cn } from '@/lib/utils'
import { clusterIcon, worstStatus } from './markers'
import { DeviceMarker } from './DeviceMarker'

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
}

interface ClusterLike {
  getAllChildMarkers(): L.Marker[]
  getChildCount(): number
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

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
}: {
  labels: MapLabels
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
    <div ref={ref} className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5">
      <div className="flex flex-col gap-px overflow-hidden rounded-md bg-border shadow-overlay">
        <Button variant="secondary" size="icon-sm" className="max-md:size-11" aria-label={labels.zoomIn} onClick={() => map.zoomIn()}>
          <Plus />
        </Button>
        <Button variant="secondary" size="icon-sm" className="max-md:size-11" aria-label={labels.zoomOut} onClick={() => map.zoomOut()}>
          <Minus />
        </Button>
      </div>
      <Button variant="secondary" size="icon-sm" className="max-md:size-11 shadow-overlay" aria-label={labels.fit} onClick={fit}>
        <Maximize2 />
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="icon-sm" className="max-md:size-11 shadow-overlay" aria-label={labels.layers}>
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
        </PopoverContent>
      </Popover>
    </div>
  )
}

function Fitter({ list, trigger }: { list: Device[]; trigger: number }) {
  const map = useMap()
  const key = list.map((d) => d.id).join(',')
  useEffect(() => {
    const b = boundsOf(list)
    if (b) map.fitBounds(b, { padding: [48, 48], maxZoom: 14, animate: trigger > 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, trigger])
  return null
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

function Resizer() {
  const map = useMap()
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

export function FleetMap({ devices, track, selectedId, onSelect, fitTo, height = 480, className, labels = DEFAULT_MAP_LABELS }: FleetMapProps) {
  const [showTiles, setShowTiles] = useState(true)
  const [clusters, setClusters] = useState(true)
  const [tiles, setTiles] = useState({ ok: 0, err: 0 })
  const tileError = tiles.ok === 0 && tiles.err >= 3
  const [fitTick, setFitTick] = useState(0)

  const fitList = useMemo(() => {
    const sub = fitTo?.length ? devices.filter((d) => fitTo.includes(d.id)) : devices
    return sub.length ? sub : devices
  }, [devices, fitTo])

  const groupRef = useRef<{ refreshClusters: () => void } | null>(null)
  const statusKey = devices.map((d) => `${d.id}:${d.status}`).join(',')
  // Cluster icons are only rebuilt on re-cluster; force it when any device state changes.
  useEffect(() => {
    groupRef.current?.refreshClusters()
  }, [statusKey])

  const markers = devices.map((d) => (
    <DeviceMarker key={`${d.id}:${d.status}:${d.series ?? ''}`} device={d} selected={d.id === selectedId} onSelect={onSelect} labels={labels} />
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
            url={TILE_URL}
            attribution={ATTRIBUTION}
            eventHandlers={{
              tileerror: () => setTiles((t) => ({ ...t, err: t.err + 1 })),
              tileload: () => setTiles((t) => (t.ok ? t : { ...t, ok: 1 })),
            }}
          />
        )}
        {clusters ? (
          <MarkerClusterGroup
            ref={groupRef}
            chunkedLoading
            showCoverageOnHover={false}
            maxClusterRadius={50}
            iconCreateFunction={(c: ClusterLike) => {
              const worst = worstStatus(c.getAllChildMarkers().map((m) => (m.options as { status?: DeviceStatus }).status ?? 'ok'))
              return clusterIcon(c.getChildCount(), worst, labels.cluster(c.getChildCount(), labels.status[worst]))
            }}
          >
            {markers}
          </MarkerClusterGroup>
        ) : (
          markers
        )}
        {track && <TrackLayer track={track} />}
        <Fitter list={fitList} trigger={fitTick} />
        <Resizer />
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
