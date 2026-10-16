import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import type { HistoryHook, HistoryRow } from '../api/history'
import {
  allPositionsForFit,
  buildDeviceSeries,
  computeSliderBounds,
  computeVisibleMarkers,
  formatUtcInstant,
  massFillColor,
  REPLAY_TICK_MS,
  replayStepMs,
  trailPositions,
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
}

/** Marker visuals mirror `map_timeline.js`'s `.tl-pin` divIcon: fill =
 * mass threshold color (CB21), border = the device's stable palette color
 * — never an image asset, so there is no bundler-relative marker icon
 * path to resolve (same reasoning as Live Tracking's `PositionsMap`,
 * KAN-160). */
function markerIcon(fillColor: string, borderColor: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${fillColor};border:3px solid ${borderColor};box-shadow:0 0 0 1px rgba(0,0,0,0.35);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

// `map_timeline.js`'s own hardcoded initial view (a c-PAL facility near
// Marseille) — kept identical rather than re-centered, since the auto-fit
// (CB25/FR16) takes over the instant any data exists; this only matters
// for the empty/pre-data frame.
const INITIAL_CENTER: [number, number] = [43.4938, 5.3539]
const INITIAL_ZOOM = 11
const FIT_OPTIONS = { padding: [50, 50] as [number, number], maxZoom: 15 }

export function TimelineMap({ rows, hooks, visibleDeviceIds = null }: TimelineMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const firstRenderPendingRef = useRef(true)

  const byDevice = useMemo(() => buildDeviceSeries(rows), [rows])
  const bounds = useMemo(() => computeSliderBounds(rows), [rows])

  const [instant, setInstant] = useState(bounds.max)
  const [trailEnabled, setTrailEnabled] = useState(false)
  const [playing, setPlaying] = useState(false)

  // CB19 (`setData`) — a new `rows` set resets the slider to the end,
  // stops any running replay, and re-arms the once-per-load auto-fit
  // (CB25's `premierRendu`); re-keyed on `rows` itself, not a derived
  // value, so this also fires correctly when a refresh returns the exact
  // same bounds (e.g. zero rows twice in a row).
  useEffect(() => {
    setInstant(bounds.max)
    setPlaying(false)
    firstRenderPendingRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on `rows`, not `bounds` (a new object every render).
  }, [rows])

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

  function handleSliderChange(event: React.ChangeEvent<HTMLInputElement>) {
    setPlaying(false)
    setInstant(Number(event.target.value))
  }

  function handleTogglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    setInstant((previous) => (previous >= bounds.max ? bounds.min : previous))
    setPlaying(true)
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

  const hasRows = rows.length > 0

  return (
    <div className="flex flex-col gap-3" data-testid="timeline-map">
      {/*
       * KAN-176 (FR26) — `var(--color-surface)` shows through at the map's
       * edges/corners (and briefly while tiles are still loading) instead
       * of Leaflet's own hardcoded light-grey default, which otherwise
       * stayed a light rectangle in dark mode even with the tile-pane
       * invert filter below (`tokens.css`'s `.leaflet-tile-pane` rule,
       * scoped so it never touches markers/trail/tooltips).
       */}
      <div style={{ height: 480, width: '100%', backgroundColor: 'var(--color-surface)' }}>
        <MapContainer
          ref={mapRef}
          center={INITIAL_CENTER}
          zoom={INITIAL_ZOOM}
          style={{ height: '100%', width: '100%' }}
          className="timeline-map"
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {trailEnabled &&
            markers
              .filter((marker) => marker.idx > 0)
              .map((marker) => (
                <Polyline
                  key={`trail-${marker.chipId}`}
                  positions={trailPositions(marker.series, marker.idx)}
                  pathOptions={{ color: marker.color, weight: 2.5, opacity: 0.55 }}
                />
              ))}
          {markers.map((marker) => (
            <Marker
              key={marker.chipId}
              position={[marker.row.la as number, marker.row.lo as number]}
              icon={markerIcon(massFillColor(marker.row.m), marker.color)}
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
          ))}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-3" data-testid="timeline-controls">
        <input
          type="range"
          data-testid="timeline-slider"
          aria-label="Instant sélectionné"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={instant}
          disabled={!hasRows}
          onChange={handleSliderChange}
        />
        <span data-testid="timeline-instant-label" style={{ color: 'var(--color-text)' }}>
          {hasRows ? formatUtcInstant(instant) : '—'}
        </span>
        <button
          type="button"
          data-testid="timeline-play-toggle"
          onClick={handleTogglePlay}
          disabled={!hasRows}
          className="rounded-md border px-3 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          {playing ? 'Pause' : 'Rejouer'}
        </button>
        <label className="flex items-center gap-1 text-sm" style={{ color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            data-testid="timeline-trail-toggle"
            checked={trailEnabled}
            onChange={(event) => setTrailEnabled(event.target.checked)}
          />
          Afficher la trace
        </label>
        <button
          type="button"
          data-testid="timeline-fit"
          onClick={handleFit}
          disabled={!hasRows}
          className="rounded-md border px-3 py-1 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
        >
          Ajuster
        </button>
      </div>
    </div>
  )
}
