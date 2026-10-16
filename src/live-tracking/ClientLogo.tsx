import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { fetchClientLogoObjectUrl } from '../api/clientLogo'

type LogoState = 'loading' | 'logo' | 'placeholder'

/**
 * KAN-161 (FR1-FR4, NFR3, NFR4, NFR6, NFR7) — renders the signed-in
 * client's own logo in the app chrome's branding slot, or a single
 * neutral placeholder.
 *
 * FR2: an admin, or a user with no `ClientID`, never triggers a logo
 * request at all and the branding slot renders nothing — not even the
 * placeholder (replicates CB5/CB14). `skip` below gates both the effect
 * and the render on that, derived straight from `AuthContext` (never
 * re-derived locally).
 *
 * FR3/NFR7: every OTHER non-success outcome — the unified 404 (no logo OR
 * out-of-scope clientId, indistinguishable server-side per
 * `client_logo_logic.php`), the `must_change_password` 403, a 503, or a
 * plain network error — collapses into the exact same placeholder markup.
 * This component deliberately never inspects the thrown error beyond
 * "the request didn't succeed": no branch here is allowed to depend on
 * `ApiError.status`/`code`, which is what keeps the failure causes
 * UI-indistinguishable by construction, not by convention.
 *
 * Reconciles KAN-165's original `ClientLogo` (which silently rendered
 * nothing on ANY failure, gated by a separate `logo-flag.php` round trip)
 * with this story's requirement for a deliberate, visible placeholder on
 * failure — see `api/clientLogo.ts` for why the flag call itself was
 * retired rather than kept alongside this.
 */
export function ClientLogo() {
  const { account, isAdmin } = useAuth()
  const clientId = account?.clientId ?? null
  const skip = isAdmin || clientId === null

  const [state, setState] = useState<LogoState>('loading')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (skip) return undefined

    let cancelled = false
    let objectUrl: string | null = null
    setState('loading')

    fetchClientLogoObjectUrl(clientId as number)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setLogoUrl(url)
        setState('logo')
      })
      .catch(() => {
        if (!cancelled) setState('placeholder')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // `skip`/`clientId` are the only inputs this ever needs to react to —
    // a role or client change re-runs exactly once, never duplicating the
    // in-flight request itself (NFR6).
  }, [skip, clientId])

  if (skip || state === 'loading') return null

  if (state === 'placeholder') {
    return (
      <div
        data-testid="client-logo-placeholder"
        aria-hidden="true"
        className="h-20 w-[220px] rounded-md"
        style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      />
    )
  }

  return (
    <img
      src={logoUrl ?? undefined}
      alt="Logo du client"
      data-testid="client-logo"
      className="max-h-20 max-w-[220px] object-contain"
    />
  )
}
