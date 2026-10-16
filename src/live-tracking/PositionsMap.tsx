import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, Tooltip } from 'react-leaflet'
import type { Position } from '../api/positions'
import { deviceBorderColor, massFillColor } from './markerStyle'
import { formatPositionTooltip } from './positionTooltip'

/**
 * KAN-160 (FR3/FR4) — one marker per positioned device.
 *
 * Deliberately uses `L.divIcon` (an inline-styled `<div>`, not Leaflet's
 * default `L.Icon` pin image) so no marker image asset has to be bundled
 * or path-resolved at all — the classic Vite/Leaflet "broken default
 * marker icon" problem (relative image URLs that don't survive a bundler)
 * never comes up, and the fill/border colours (FR5/FR6) are plain CSS on
 * that div rather than an image swap. `L.Marker` (not `L.CircleMarker`, a
 * non-interactive SVG/Canvas path) is used specifically because it is
 * natively keyboard-focusable and Leaflet already opens its bound
 * `Tooltip` on focus as well as hover (NFR7) — a `CircleMarker` is not
 * focusable at all.
 */
function markerIcon(fillColor: string, borderColor: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${fillColor};border:3px solid ${borderColor};box-shadow:0 0 0 1px rgba(0,0,0,0.35);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  })
}

/** Devices without a usable `latitude`/`longitude` never produce a marker
 * (FR3/FR4's "unpositioned devices produce no marker") — `HasPosition=1`
 * already guarantees this server-side (`tracking_logic.php`), but a
 * missing coordinate is still checked defensively rather than assumed. */
function hasCoordinates(position: Position): position is Position & { latitude: number; longitude: number } {
  return position.latitude !== null && position.longitude !== null
}

const DEFAULT_CENTER: [number, number] = [46.6, 2.5] // mainland France, no contract selected yet
const DEFAULT_ZOOM = 5

export function PositionsMap({ positions }: { positions: Position[] }) {
  const positioned = positions.filter(hasCoordinates)
  const center: [number, number] =
    positioned.length > 0 ? [positioned[0].latitude, positioned[0].longitude] : DEFAULT_CENTER

  return (
    <MapContainer
      center={center}
      zoom={positioned.length > 0 ? 10 : DEFAULT_ZOOM}
      style={{ height: 480, width: '100%' }}
      className="position-map"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {positioned.map((position) => (
        <Marker
          key={position.chipId}
          position={[position.latitude, position.longitude]}
          icon={markerIcon(massFillColor(position.mass), deviceBorderColor(position.chipId))}
        >
          <Tooltip data-testid={`marker-tooltip-${position.chipId}`}>
            <ul className="m-0 list-none p-0 text-xs">
              {formatPositionTooltip(position).map((field) => (
                <li key={field.label}>
                  <strong>{field.label}:</strong> {field.value}
                </li>
              ))}
            </ul>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
