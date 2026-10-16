import { apiClient, fetchBinary } from './client'

interface LogoFlagResponse {
  hasLogo: boolean
}

/** KAN-165 (FR13) — whether the caller's own client has a logo registered. */
export async function fetchHasLogo(): Promise<boolean> {
  const body = await apiClient.get<LogoFlagResponse>('/clients/logo-flag.php')
  return body.hasLogo
}

/**
 * Fetches the logo image bytes and returns a `blob:` object URL for an
 * `<img src>`. Caller owns the URL's lifetime and must `URL.revokeObjectURL`
 * it once done (e.g. on unmount) to avoid leaking it.
 */
export async function fetchLogoObjectUrl(): Promise<string> {
  const blob = await fetchBinary('/clients/logo.php')
  return URL.createObjectURL(blob)
}
