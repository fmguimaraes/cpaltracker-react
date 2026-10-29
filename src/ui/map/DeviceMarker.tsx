import { useEffect, useRef } from 'react'
import { Marker } from 'react-leaflet'
import type L from 'leaflet'
import type { MapDevice, MapLabels } from './types'
import { deviceIcon } from './markers'

interface DeviceMarkerProps {
  device: MapDevice
  selected: boolean
  onSelect?: (id: string) => void
  labels: MapLabels
}

/** Marker options are read once by the cluster group; carry the status on them (typed). */
function statusOptions(status: MapDevice['status']): L.MarkerOptions {
  return { status } as L.MarkerOptions
}

function syncPressed(marker: L.Marker | null, selected: boolean, id: string) {
  const el = marker?.getElement()
  el?.setAttribute('aria-pressed', String(selected))
  // lets an app map a DOM event back to its device without parsing the title
  el?.setAttribute('data-marker-id', id)
}

/** Select via mouse, Enter or Space; mirrors selection to aria-pressed. */
export function DeviceMarker({ device, selected, onSelect, labels }: DeviceMarkerProps) {
  const ref = useRef<L.Marker | null>(null)
  // runs after Marker's own effect, so it sees the element created by setIcon
  useEffect(() => syncPressed(ref.current, selected, device.id))
  return (
    <Marker
      ref={ref}
      // status in the key: marker options are read once, so a state change remounts the marker
      key={`${device.id}:${device.status}:${device.series ?? ''}`}
      position={[device.lat, device.lng]}
      icon={deviceIcon(device, selected, labels.status[device.status])}
      zIndexOffset={selected ? 1000 : 0}
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
      {...statusOptions(device.status)}
    />
  )
}
