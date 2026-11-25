/**
 * Basemap (spec "Clair minéral" / "Sombre graphite", 2026-11-25). The spec's first choice, CARTO Positron /
 * Dark Matter, now answers "API key required" without a CARTO account, so the app uses its alternative: a
 * style matched to the --map-* tokens. OpenStreetMap raster tiles, recolored per theme by
 * --map-tile-filter (tokens.css): desaturated toward the mineral grey-green in light, inverted to graphite
 * in dark. Switching theme restyles the tiles in place (no reload). Attribution stays visible.
 * To move to CARTO later: an API key, its tile URLs here per theme, --map-tile-filter: none, and the CSP.
 */
export const BASEMAP = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const

/** TileLayer props. */
export function useBasemap() {
  return BASEMAP
}
