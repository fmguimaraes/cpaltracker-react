import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { buildLoginRedirectPath } from '../auth/suite'
import { CHANGE_PASSWORD_PATH } from '../auth/paths'

interface RequireAuthProps {
  children: ReactNode
  /**
   * Mirrors the backend's own `allowMustChangePassword` gate (api/openapi.yaml
   * `bearerAuth` description, KAN-125): when `true`, an account with
   * `mustChangePassword` may still render this route instead of being
   * redirected to `CHANGE_PASSWORD_PATH`. Only the password-change route
   * itself should ever set this (FR14).
   */
  allowMustChangePassword?: boolean
}

/**
 * KAN-149 — protected-route guard.
 *
 * - `loading`: renders a neutral placeholder — never redirects yet, so an
 *   authenticated user never sees a flash of the login redirect before the
 *   bootstrap `refresh()` resolves (NFR4 intent carried into this guard).
 * - `anonymous`: redirects to `/login` with the attempted URL preserved as
 *   `suite` (FR13, replicates CB32).
 * - `authenticated`: blocks every route except the password-change one while
 *   `mustChangePassword` is set (FR14, replicates CB33), otherwise renders
 *   the protected content.
 */
export function RequireAuth({
  children,
  allowMustChangePassword = false,
}: RequireAuthProps) {
  const { status, account } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p
          data-testid="auth-loading"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Checking session…
        </p>
      </main>
    )
  }

  if (status === 'anonymous') {
    return <Navigate to={buildLoginRedirectPath(location)} replace />
  }

  if (account?.mustChangePassword && !allowMustChangePassword) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  }

  return <>{children}</>
}
