import { useEffect, useState } from 'react'
import { fetchClientLogoObjectUrl } from '../api/clientLogo'
import { useAuth } from '../auth/AuthContext'
import { Skeleton } from '@/ui/skeleton'

type LogoState = 'loading' | 'logo' | 'none'

/**
 * The client logo slot of the app shell: compact, a Skeleton while the logo loads and nothing
 * at all for an admin or a user without a `ClientID` (FR2: no request is sent for them).
 *
 * Every failure (no logo, forbidden, network) renders nothing, the same way for each cause
 * (NFR7: the outcome never reveals why the logo is missing).
 */
export function ShellClientLogo() {
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
        if (!cancelled) setState('none')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [skip, clientId])

  if (skip || state === 'none') return null

  if (state === 'loading') {
    return (
      <Skeleton
        data-testid="client-logo-skeleton"
        aria-hidden="true"
        className="h-10 w-28"
      />
    )
  }

  return (
    <img
      src={logoUrl ?? undefined}
      alt="Logo du client"
      data-testid="client-logo"
      className="max-h-10 max-w-28 object-contain"
    />
  )
}
