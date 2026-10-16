import { useEffect, useState } from 'react'
import { fetchHasLogo, fetchLogoObjectUrl } from '../api/clientLogo'

/**
 * KAN-165 (FR13) — the client logo, gated on `GET /api/v1/clients/logo-flag.php`
 * rather than assumed present, and hidden gracefully on any failure.
 *
 * The logo endpoint is bearer-auth like every other `/api/v1` call, so a
 * plain `<img src="…/clients/logo.php">` can't carry the token (the API
 * never accepts cookies — NFR1) — the image bytes are fetched here via
 * `fetchLogoObjectUrl()` and handed to `<img>` as a `blob:` object URL.
 * `onError` is kept on the `<img>` itself too (the Technical
 * Requirement's literal ask) as a second line of defense beyond the
 * `hasLogo` gate, in case the object URL fails to decode.
 */
export function ClientLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    fetchHasLogo()
      .then((hasLogo) => {
        if (cancelled || !hasLogo) return undefined
        return fetchLogoObjectUrl().then((url) => {
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          objectUrl = url
          setLogoUrl(url)
        })
      })
      .catch(() => {
        if (!cancelled) setHidden(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  if (!logoUrl || hidden) return null

  return (
    <img
      src={logoUrl}
      alt="Logo du client"
      data-testid="client-logo"
      className="h-12 w-auto"
      onError={() => setHidden(true)}
    />
  )
}
