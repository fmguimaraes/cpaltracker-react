/**
 * Kit-owned device shape for the map. The kit never imports app/mock data:
 * any richer device (e.g. the mock `Device`) is accepted structurally.
 */
export type MapDeviceStatus = 'ok' | 'warning' | 'alert' | 'offline'

export interface MapDevice {
  id: string
  name: string
  status: MapDeviceStatus
  lat: number
  lng: number
  /**
   * Optional series index (same index as `seriesStyle(i)` / the chart palette).
   * When set, the marker carries a swatch: --chart-1..5 colour, shape changes per cycle (K-7).
   */
  series?: number
  /**
   * Optional remaining-load level, 1 (empty) … 5 (full load). When set, the marker's ring and dot use the
   * --load-1..5 ramp instead of the state colours (the state stays in the title and screen-reader text).
   */
  load?: MapLoadLevel
}

export type MapLoadLevel = 1 | 2 | 3 | 4 | 5

/** Human labels of the four states (kept in sync with the status vocabulary). */
export const MAP_STATUS_LABEL: Record<MapDeviceStatus, string> = {
  ok: 'OK',
  warning: 'Warning',
  alert: 'Alert',
  offline: 'Not reporting',
}

/** The map's visible bounds, in degrees (reported by `FleetMap`'s `onViewportChange`). */
export interface MapViewport {
  north: number
  south: number
  east: number
  west: number
}

/** A path already travelled by one device (`[lat, lng]` points, oldest first), drawn under the markers. */
export interface MapTrail {
  id: string
  points: Array<[number, number]>
}

/** One point of a recorded track (K-8). `t` is an ISO timestamp. */
export interface TrackPoint {
  t: string
  lat: number
  lng: number
}

/**
 * Every human-readable string the map renders. Defaults are English; an app
 * that ships another language passes `labels` (the kit never hardcodes it).
 */
export interface MapLabels {
  region: string
  zoomIn: string
  zoomOut: string
  fit: string
  layers: string
  basemap: string
  clusters: string
  tilesFailed: string
  status: Record<MapDeviceStatus, string>
  /** aria-label of a cluster bubble. */
  cluster: (count: number, worstStatus: string) => string
}

export const DEFAULT_MAP_LABELS: MapLabels = {
  region: 'Fleet map',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit all devices in view',
  layers: 'Map layers',
  basemap: 'Basemap',
  clusters: 'Clusters',
  tilesFailed: 'Map tiles could not be loaded. Markers remain accurate.',
  status: MAP_STATUS_LABEL,
  cluster: (count, worst) => `${count} devices, worst state ${worst}`,
}
