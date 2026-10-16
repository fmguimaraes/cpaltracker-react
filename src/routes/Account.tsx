import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Card } from '../chrome/Card'
import { PageTitle } from '../chrome/PageTitle'
import { useAuth } from '../auth/AuthContext'
import { HOME_PATH } from '../auth/paths'
import { EmailForm } from './account/EmailForm'
import { PasswordForm } from './account/PasswordForm'
import { PhoneForm } from './account/PhoneForm'

/**
 * KAN-152 — Account Self-Service (FR9, FR10).
 *
 * FR9: mounted only behind `RequireAuth allowMustChangePassword` (App.tsx)
 * — the gate itself, including the anonymous-visit redirect with the
 * preserved return path, is `RequireAuth`'s existing job (KAN-149), not
 * reimplemented here.
 * FR10: first-connection mode is `mustChangePassword` (from the
 * authenticated account) OR a `?premiere` query flag — either hides the
 * phone/e-mail panels, the "back to app" link and the logout control,
 * rendering only the password form, matching `account.php`'s own
 * `$premiere` branch.
 */
export function Account() {
  const { account, logout } = useAuth()
  const [searchParams] = useSearchParams()
  const [loggingOut, setLoggingOut] = useState(false)

  if (!account) {
    return null
  }

  // Mirrors HelloWorld.tsx's own logout handling (KAN-156 review gate):
  // disabling the button while in flight is what actually prevents a
  // duplicate POST with an already-consumed token, not anything in
  // AuthContext alone; a thrown ApiError is swallowed — by the time it
  // could throw the user is already signed out locally and RequireAuth is
  // about to redirect them away.
  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // intentionally ignored — see comment above
    } finally {
      setLoggingOut(false)
    }
  }

  const firstConnection = account.mustChangePassword || searchParams.has('premiere')

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <PageTitle>Mon compte</PageTitle>

      <Card className="flex flex-col gap-8">
        {firstConnection && (
          <p
            data-testid="account-first-connection-notice"
            className="text-sm"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Choisissez votre mot de passe. Celui qui vous a été communiqué est
            provisoire. Tant qu'il n'est pas remplacé, l'application reste
            inaccessible.
          </p>
        )}

        <PasswordForm />

        {!firstConnection && (
          <>
            <PhoneForm account={account} />
            <EmailForm account={account} />

            <div className="flex items-center justify-between">
              <Link
                to={HOME_PATH}
                data-testid="account-back-to-app"
                className="text-sm underline"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Retour à l'application
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                data-testid="account-logout"
                className="text-sm underline disabled:opacity-50"
                style={{ color: 'var(--color-text-muted)' }}
              >
                Se déconnecter
              </button>
            </div>
          </>
        )}
      </Card>
    </main>
  )
}
