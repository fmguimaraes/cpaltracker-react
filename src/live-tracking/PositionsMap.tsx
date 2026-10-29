import { useCallback, useMemo, useState, type FocusEvent, type MouseEvent } from 'react'
import type { Position } from '../api/positions'
import { FleetMap, type MapDevice, type MapLabels } from '@/ui/map'
import { cn } from '@/lib/utils'
import { STATE_LABEL } from './fleetModel'
import { massStatus } from './markerStyle'
import { formatPositionTooltip } from './positionTooltip'

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

export function PositionsMap({ positions, className }: { positions: Position[]; className?: string }) {
  const positioned = useMemo(() => positions.filter(hasCoordinates), [positions])
  const devices = useMemo<MapDevice[]>(
    () =>
      positioned.map((p) => ({
        id: p.chipId,
        name: p.chipId,
        status: massStatus(p.mass),
        lat: p.latitude,
        lng: p.longitude,
      })),
    [positioned],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const onSelect = useCallback((id: string) => setSelectedId((prev) => (prev === id ? null : id)), [])
  // Memoised on purpose: a hover/focus change must not re-render the kit map, or the
  // cluster layer re-adds its markers and the focused marker element is replaced.
  const map = useMemo(
    () => <FleetMap devices={devices} selectedId={selectedId} onSelect={onSelect} height="100%" className="rounded-none" labels={MAP_LABELS} />,
    [devices, selectedId, onSelect],
  )

  const shown = positioned.find((p) => p.chipId === (activeId ?? selectedId))

  return (
    <div
      className={cn('position-map relative size-full', className)}
      data-testid="positions-map"
      onFocus={(e: FocusEvent) => setActiveId(markerIdOf(e.target))}
      onBlur={() => setActiveId(null)}
      onMouseOver={(e: MouseEvent) => setActiveId(markerIdOf(e.target))}
      onMouseOut={() => setActiveId(null)}
    >
      {map}
      {shown && (
        <div
          role="tooltip"
          data-testid={`marker-tooltip-${shown.chipId}`}
          className="leaflet-tooltip pointer-events-none right-3 bottom-3 z-1000 !rounded-lg !border-border !bg-card !p-3 !text-card-foreground shadow-overlay md:right-16 md:bottom-8"
        >
          <p className="mb-1 text-sm font-semibold">{shown.chipId}</p>
          <ul className="m-0 list-none p-0 text-xs tabular-nums">
            {formatPositionTooltip(shown).map((field) => (
              <li key={field.label}>
                <strong>{field.label}:</strong> {field.value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
