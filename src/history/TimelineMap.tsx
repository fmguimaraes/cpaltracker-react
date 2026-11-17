import type L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { CheckIcon, Pause, Play, Scan, Route, TriangleAlert } from 'lucide-react'
import type { HistoryHook, HistoryRow } from '../api/history'
import { cn } from '@/lib/utils'
import { Alert } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Slider } from '@/ui/slider'
import { Toggle } from '@/ui/toggle'
import { Card, CardContent } from '@/ui/card'
import { useChartTheme } from '@/ui/charts/use-chart-theme'
import { deviceIcon, type MapDevice } from '@/ui/map'
import {
  allPositionsForFit,
  buildDeviceSeries,
  computeSliderBounds,
  computeVisibleMarkers,
  formatUtcInstant,
  massStatus,
  REPLAY_TICK_MS,
  replayStepMs,
  trailPositions,
  visibleDeviceOrder,
} from './timelineData'
import { formatTimelineTooltip } from './timelineTooltip'

/**
 * KAN-174 (FR10-18, NFR1, NFR3) — the self-contained scrubbable/replayable
 * trail map, replicating `map_timeline.js`'s time-slider, trail, replay,
 * tooltip and auto-fit behavior (CB19-CB25) on bundled Leaflet/react-leaflet
 * (NFR1 — no CDN). All the actual trail/replay math lives in
 * `timelineData.ts`/`timelineTooltip.ts`, kept pure so this component only
 * wires that math to React state and Leaflet calls (NFR3: slider/trail
 * changes never touch the network — this component takes `rows`/`hooks` as
 * already-fetched props and never calls `fetch` itself).
 *
 * Deliberately has no opinion on data fetching, device selection, contract
 * scoping, or date-range validation — those are KAN-170/KAN-172/KAN-175's
 * jobs. `visibleDeviceIds` is accepted as a plain prop (`null` = all
 * devices) so KAN-175's device checklist can filter this map without this
 * file changing, the same extension-point pattern `HistoryAccessGate`
 * already established for this story (GAP1: built as reusable, no
 * assumption Live Tracking shares it).
 */
export interface TimelineMapProps {
  rows: HistoryRow[]
  hooks: HistoryHook[]
  /** `null` (default) = every device in `rows` is visible — KAN-175's
   * device checklist will pass the actual selection once it exists. */
  visibleDeviceIds?: string[] | null
  /**
   * KAN-252 — reports the slider's current instant (epoch ms) up to
   * `HistoryReadyPanel`, so the measure charts' modal can draw a cursor in
   * sync with "Rejouer"/scrubbing. `null` whenever nothing is actively
   * playing or has been scrubbed — i.e. the pristine post-load state,
   * never "the last instant a `rows` load happened to land on" — so a
   * chart cursor never appears at a meaningless default position.
   */
  onInstantChange?: (instant: number | null) => void
}

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
/** Same rule as the kit's `FleetMap`: no tile ever loaded and at least 3 errors. */
const TILE_ERROR_THRESHOLD = 3

// `map_timeline.js`'s own hardcoded initial view (a c-PAL facility near
// Marseille) — kept identical rather than re-centered, since the auto-fit
// (CB25/FR16) takes over the instant any data exists; this only matters
// for the empty/pre-data frame.
const INITIAL_CENTER: [number, number] = [43.4938, 5.3539]
const INITIAL_ZOOM = 11
/** French status words for the marker's sr-only text (the kit default is English). */
const STATUS_TEXT_FR: Record<MapDevice['status'], string> = {
  ok: 'OK',
  warning: 'Attention',
  alert: 'Alerte',
  offline: 'Ne remonte pas',
}
const FIT_OPTIONS = { padding: [50, 50] as [number, number], maxZoom: 15 }

export function TimelineMap({ rows, hooks, visibleDeviceIds = null, onInstantChange }: TimelineMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const firstRenderPendingRef = useRef(true)

  const byDevice = useMemo(() => buildDeviceSeries(rows), [rows])
  const chartTheme = useChartTheme()
  // K-7: one stable index per visible device (`visibleDeviceOrder`), shared with the charts. The kit marker
  // swatch and the trail colour both come from it; no colour literal lives here.
  const deviceIndex = useMemo(() => {
    const out = new Map<string, number>()
    visibleDeviceOrder(rows, visibleDeviceIds).forEach((chipId, i) => out.set(chipId, i))
    return out
  }, [rows, visibleDeviceIds])
  // The kit Slider puts no role on its root and the slider role on the thumb: keep the original
  // `timeline-slider` testid on the role=slider element (same element role as the monolith's input).
  const sliderBoxRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    sliderBoxRef.current?.querySelector('[role="slider"]')?.setAttribute('data-testid', 'timeline-slider')
  })
  const [tiles, setTiles] = useState({ ok: 0, err: 0 })
  const tileError = tiles.ok === 0 && tiles.err >= TILE_ERROR_THRESHOLD
  const bounds = useMemo(() => computeSliderBounds(rows), [rows])

  const [instant, setInstant] = useState(bounds.max)
  const [trailEnabled, setTrailEnabled] = useState(true)
  const [playing, setPlaying] = useState(false)
  // KAN-252 — distinguishes "idle, `instant` just sitting at its post-load default" from "the
  // user actually played or scrubbed to this instant", so `onInstantChange` below never reports
  // a meaningful-looking instant when nothing is actually happening.
  const [hasInteracted, setHasInteracted] = useState(false)

  // CB19 (`setData`) — a new `rows` set resets the slider to the end,
  // stops any running replay, and re-arms the once-per-load auto-fit
  // (CB25's `premierRendu`); re-keyed on `rows` itself, not a derived
  // value, so this also fires correctly when a refresh returns the exact
  // same bounds (e.g. zero rows twice in a row).
  useEffect(() => {
    setInstant(bounds.max)
    setPlaying(false)
    setHasInteracted(false)
    firstRenderPendingRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on `rows`, not `bounds` (a new object every render).
  }, [rows])

  // KAN-252 (FR — measure-chart playback cursor) — report the active instant up to
  // `HistoryReadyPanel` whenever it or `hasInteracted` changes, `null` while idle.
  useEffect(() => {
    onInstantChange?.(hasInteracted ? instant : null)
  }, [instant, hasInteracted, onInstantChange])

  const markers = useMemo(
    () => computeVisibleMarkers(byDevice, visibleDeviceIds, instant),
    [byDevice, visibleDeviceIds, instant],
  )

  // CB25 (`premierRendu`) — auto-fit to the CURRENT positions of visible
  // devices, once per `rows` load; subsequent slider moves must not
  // re-trigger it (FR16).
  useEffect(() => {
    if (!firstRenderPendingRef.current) return
    if (markers.length === 0) return
    firstRenderPendingRef.current = false
    const map = mapRef.current
    if (!map) return
    const latLngs: Array<[number, number]> = markers.map((marker) => [
      marker.row.la as number,
      marker.row.lo as number,
    ])
    map.fitBounds(latLngs, FIT_OPTIONS)
  }, [markers])

  // CB24 (`basculerLecture`) — fixed 80ms-tick animation advancing
  // simulated time by `replayStepMs`, stopping automatically at `tMax`.
  useEffect(() => {
    if (!playing) return
    const step = replayStepMs(bounds.min, bounds.max)
    const interval = setInterval(() => {
      setInstant((previous) => {
        const next = Math.min(bounds.max, previous + step)
        if (next >= bounds.max) setPlaying(false)
        return next
      })
    }, REPLAY_TICK_MS)
    return () => clearInterval(interval)
  }, [playing, bounds.min, bounds.max])

  function handleSliderChange([value]: number[]) {
    setPlaying(false)
    setInstant(value)
    setHasInteracted(true)
  }

  // CB25 (`ajuster`) — on-demand fit over each visible device's ENTIRE
  // positioned series, not just its current marker (FR15, distinct from
  // the current-position-only auto-fit above).
  function handleFit() {
    const map = mapRef.current
    if (!map) return
    const points = allPositionsForFit(byDevice, visibleDeviceIds)
    if (points.length === 0) return
    map.fitBounds(points, FIT_OPTIONS)
  }

  function handleTogglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    setInstant((previous) => (previous >= bounds.max ? bounds.min : previous))
    setPlaying(true)
    setHasInteracted(true)
    handleFit()
  }

  const hasRows = rows.length > 0

  return (
    <Card size="sm" className="min-w-0 gap-0 py-0" data-testid="timeline-map">
      <CardContent className="flex flex-col gap-3 px-0">
        {/*
         * KAN-176 (FR26) — `bg-media` shows through at the map's edges/corners
         * (and while tiles load) instead of Leaflet's light-grey default; the
         * dark tile filter is `tokens.css`'s `.leaflet-tile-pane` rule, scoped
         * so it never touches markers/trail/tooltips.
         */}
        <div className="relative aspect-[160/63] w-full overflow-hidden rounded-lg bg-media">
          <div className="absolute top-2.5 right-2.5 z-[1000] flex gap-1.5">
            <Toggle
              variant="outline"
              size="sm"
              aria-label="Afficher la trace"
              title="Afficher la trace"
              data-testid="timeline-trail-toggle"
              pressed={trailEnabled}
              onPressedChange={setTrailEnabled}
              disabled={!hasRows}
              className="relative bg-card"
            >
              <Route />
              <span
                aria-hidden
                className={cn(
                  'absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-[4px] border border-input shadow-xs',
                  trailEnabled ? 'border-primary-text bg-primary text-primary-foreground' : 'bg-card',
                )}
              >
                {trailEnabled && <CheckIcon className="size-2.5" />}
              </span>
            </Toggle>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={playing ? 'Pause' : 'Rejouer'}
              title={playing ? 'Pause' : 'Rejouer'}
              data-testid="timeline-play-toggle"
              onClick={handleTogglePlay}
              disabled={!hasRows}
              className="bg-card"
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Ajuster"
              title="Ajuster"
              data-testid="timeline-fit"
              onClick={handleFit}
              disabled={!hasRows}
              className="bg-card"
            >
              <Scan />
            </Button>
          </div>
          <MapContainer
            ref={mapRef}
            center={INITIAL_CENTER}
            zoom={INITIAL_ZOOM}
            className="timeline-map size-full"
          >
            <TileLayer
              url={TILE_URL}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              eventHandlers={{
                tileerror: () => setTiles((t) => ({ ...t, err: t.err + 1 })),
                tileload: () => setTiles((t) => (t.ok ? t : { ...t, ok: 1 })),
              }}
            />
            {trailEnabled &&
              markers
                .filter((marker) => marker.idx > 0)
                .map((marker) => {
                  return (
                    <Polyline
                      key={`trail-${marker.chipId}`}
                      positions={trailPositions(marker.series, marker.idx)}
                      pathOptions={{
                        color: chartTheme.primary,
                        weight: chartTheme.theme === 'light' ? 4 : 3,
                        opacity: 1,
                      }}
                    />
                  )
                })}
            {markers.map((marker) => {
              const device: MapDevice = {
                id: marker.chipId,
                name: marker.chipId,
                status: massStatus(marker.row.m),
                lat: marker.row.la as number,
                lng: marker.row.lo as number,
                series: deviceIndex.get(marker.chipId),
              }
              return (
                <Marker
                  key={`${device.id}:${device.status}:${device.series ?? ''}`}
                  position={[device.lat, device.lng]}
                  icon={deviceIcon(device, false, STATUS_TEXT_FR[device.status])}
                >
                  <Tooltip data-testid={`timeline-tooltip-${marker.chipId}`}>
                    <ul className="m-0 list-none p-0 text-xs">
                      {formatTimelineTooltip(marker.row, hooks).map((field) => (
                        <li key={field.label}>
                          <strong>{field.label}:</strong> {field.value}
                        </li>
                      ))}
                    </ul>
                  </Tooltip>
                </Marker>
              )
            })}
          </MapContainer>
        </div>

        {tileError && (
          <Alert variant="warning" role="status" data-testid="timeline-tile-notice">
            <TriangleAlert aria-hidden />
            <div>Les tuiles de la carte n'ont pas pu être chargées. Les marqueurs restent exacts.</div>
          </Alert>
        )}

        <div
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          role="group"
          aria-label="Lecture de la chronologie"
          data-testid="timeline-controls"
        >
          <div ref={sliderBoxRef} className="flex min-w-0 flex-1 items-center gap-3">
            <Slider
              aria-label="Instant sélectionné"
              min={bounds.min}
              max={bounds.max}
              step={bounds.step}
              value={[instant]}
              disabled={!hasRows}
              onValueChange={handleSliderChange}
            />
            <span data-testid="timeline-instant-label" className="shrink-0 text-sm tabular-nums text-body">
              {hasRows ? formatUtcInstant(instant) : '—'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
