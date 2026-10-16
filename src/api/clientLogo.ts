import { fetchBinary } from './client'

/**
 * KAN-161 (FR1, FR3, NFR3, NFR6, NFR7) — fetches the given client's logo
 * image bytes from the single unified-404 endpoint,
 * `GET /clients/logo.php/{clientId}` (api/openapi.yaml, KAN-124/125), and
 * returns a `blob:` object URL for an `<img src>`.
 *
 * Reconciliation note (KAN-165 → KAN-161): KAN-165's original
 * `ClientLogo` called this endpoint through a two-call model —
 * `GET /clients/logo-flag.php` (own-client "do I have a logo" boolean)
 * followed, only if `true`, by `GET /clients/logo.php` with no id. That
 * endpoint already collapses "out of scope" and "in scope but no logo"
 * into the exact same 404 response, at the exact same DB-query cost
 * (`client_logo_logic.php`, B1) — the backend-side half of GAP1/IMP1 this
 * epic exists to carry into the UI. A second, separate flag round-trip
 * added nothing but another place for the frontend to reintroduce that
 * distinction (and another request per render, which NFR6 forbids), so
 * this story retires `fetchHasLogo()`/the flag call: the UI now makes
 * exactly one request and treats its single failure mode uniformly (see
 * `ClientLogo.tsx`).
 *
 * Caller owns the returned object URL's lifetime and must
 * `URL.revokeObjectURL` it once done (e.g. on unmount) to avoid leaking it.
 */
export async function fetchClientLogoObjectUrl(clientId: number): Promise<string> {
  const blob = await fetchBinary(`/clients/logo.php/${clientId}`)
  return URL.createObjectURL(blob)
}
