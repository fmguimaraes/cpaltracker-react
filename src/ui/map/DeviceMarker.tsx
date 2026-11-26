import { useEffect, useMemo, useRef } from 'react'
import { Marker } from 'react-leaflet'
import type L from 'leaflet'
import type { MapDevice, MapLabels } from './types'
import { deviceIcon } from './markers'

interface DeviceMarkerProps {
  device: MapDevice
  selected: boolean
  /** Optional hover cue from outside the map (e.g. a list row); off by default. */
  highlighted?: boolean
  onSelect?: (id: string) => void
  labels: MapLabels
  /** Optional compact style (see `deviceIcon`); hovering raises it above its neighbours so its label stays readable. */
  compact?: boolean
}

/** Marker options are read once by the cluster group; carry the status (and the id, to find a marker) on them. */
function statusOptions(status: MapDevice['status'], id: string, load?: MapDevice['load']): L.MarkerOptions {
  return { status, deviceId: id, load } as L.MarkerOptions
}

function syncPressed(marker: L.Marker | null, selected: boolean, id: string) {
  const el = marker?.getElement()
  el?.setAttribute('aria-pressed', String(selected))
  // lets an app map a DOM event back to its device without parsing the title
  el?.setAttribute('data-marker-id', id)
}

/** Select via mouse, Enter or Space; mirrors selection to aria-pressed. */
export function DeviceMarker({ device, selected, highlighted = false, onSelect, labels, compact = false }: DeviceMarkerProps) {
  const ref = useRef<L.Marker | null>(null)
  // runs after Marker's own effect, so it sees the element created by setIcon
  useEffect(() => syncPressed(ref.current, selected, device.id))
  // Same array while the coordinates don't change: a new one makes react-leaflet call setLatLng, which the
  // cluster group handles as a move (remove + re-add), closing an opened group on every re-render.
  const { lat, lng } = device
  const position = useMemo<[number, number]>(() => [lat, lng], [lat, lng])
  return (
    <Marker
      ref={ref}
      // status in the key: marker options are read once, so a state change remounts the marker
      key={`${device.id}:${device.status}:${device.series ?? ''}:${device.load ?? ''}`}
      position={position}
      icon={deviceIcon(device, selected, labels.status[device.status], highlighted, compact)}
      riseOnHover={compact}
      zIndexOffset={selected || highlighted ? 1000 : 0}
      title={`${device.id} – ${device.name} (${labels.status[device.status]})`}
      eventHandlers={{
        click: () => onSelect?.(device.id),
        add: (e) => syncPressed(e.target as L.Marker, selected, device.id),
        keydown: (e) => {
          const ev = (e as unknown as { originalEvent: KeyboardEvent }).originalEvent
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault()
            onSelect?.(device.id)
          }
        },
      }}
      {...statusOptions(device.status, device.id, device.load)}
    />
  )
}
