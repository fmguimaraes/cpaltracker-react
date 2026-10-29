import L from 'leaflet'
import { DEFAULT_MAP_LABELS, MAP_STATUS_LABEL as statusLabel, type MapDevice, type MapDeviceStatus as DeviceStatus } from './types'

/** Severity order: higher = worse. Cluster ring shows the worst child state. */
export const STATUS_RANK: Record<DeviceStatus, number> = { ok: 0, offline: 1, warning: 2, alert: 3 }

/* Full literal class strings so Tailwind's scanner emits them (colors only via token utilities). */
const RING: Record<DeviceStatus, string> = {
  ok: 'ring-success',
  warning: 'ring-warning',
  alert: 'ring-danger',
  offline: 'ring-offline',
}
const DOT: Record<DeviceStatus, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  alert: 'bg-danger',
  offline: 'bg-offline',
}

const TRUCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>'

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function worstStatus(statuses: DeviceStatus[]): DeviceStatus {
  return statuses.reduce<DeviceStatus>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'ok')
}

const GLYPH_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" class="size-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
/* Non-colour state cue: a distinct glyph per state (check / triangle / octagon-x / wifi-off slash). */
const GLYPH: Record<DeviceStatus, string> = {
  ok: `<svg ${GLYPH_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`,
  warning: `<svg ${GLYPH_ATTRS}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  alert: `<svg ${GLYPH_ATTRS}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  offline: `<svg ${GLYPH_ATTRS}><path d="M5 12h14"/></svg>`,
}

/* Series swatch (K-7): colour = index % 5 (--chart-n), shape = cycle (circle, square, diamond, triangle, bar). */
const SWATCH_COLOR = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5']
const SWATCH_SHAPE = [
  'rounded-full',
  'rounded-none',
  'rounded-none rotate-45 scale-90',
  'rounded-none [clip-path:polygon(50%_0,100%_100%,0_100%)]',
  'rounded-none scale-y-50',
]

function swatch(series: number | undefined) {
  if (series === undefined) return ''
  const color = SWATCH_COLOR[series % SWATCH_COLOR.length]
  const shape = SWATCH_SHAPE[Math.floor(series / SWATCH_COLOR.length) % SWATCH_SHAPE.length]
  return `<span class="${color} ${shape} size-2.5 shrink-0" aria-hidden="true"></span>`
}

const iconCache = new Map<string, L.DivIcon>()

/** Memoised per (id, status, selected) so re-renders do not call setIcon on every marker. */
export function deviceIcon(
  d: Pick<MapDevice, 'id' | 'status' | 'series'>,
  selected: boolean,
  statusText: string = statusLabel[d.status],
): L.DivIcon {
  const key = `${d.id}|${d.status}|${d.series ?? ''}|${selected}|${statusText}`
  const hit = iconCache.get(key)
  if (hit) return hit
  const sel = selected
    ? 'bg-primary-soft text-primary-text ring-[3px] scale-110 shadow-overlay'
    : 'bg-card text-foreground ring-2 shadow-media'
  const html =
    `<div class="absolute top-0 left-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium tabular-nums transition-transform group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring ${RING[d.status]} ${sel}">` +
    `${swatch(d.series)}${TRUCK_SVG}<span>${esc(d.id)}<span class="sr-only">, ${esc(statusText)}</span></span>` +
    `<span class="${DOT[d.status]} flex size-4 items-center justify-center rounded-full text-card" aria-hidden="true">${GLYPH[d.status]}</span></div>`
  const icon = L.divIcon({
    html,
    className: 'group bg-transparent border-0 outline-none',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
  if (iconCache.size >= 500) iconCache.clear()
  iconCache.set(key, icon)
  return icon
}

export function clusterIcon(
  count: number,
  status: DeviceStatus,
  ariaLabel: string = DEFAULT_MAP_LABELS.cluster(count, statusLabel[status]),
): L.DivIcon {
  const html = `<div class="flex size-full items-center justify-center rounded-full bg-card text-sm font-semibold tabular-nums text-foreground ring-4 shadow-media ${RING[status]}" role="img" aria-label="${esc(ariaLabel)}">${count}</div>`
  const size = count < 10 ? 36 : count < 50 ? 42 : 48
  return L.divIcon({ html, className: 'group bg-transparent border-0 outline-none', iconSize: L.point(size, size) })
}
