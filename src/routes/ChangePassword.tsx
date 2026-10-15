import { useAuth } from '../auth/AuthContext'

/**
 * KAN-149 placeholder route for FR14's `MustChangePassword` guard target.
 * `RequireAuth` (this same story) redirects any `mustChangePassword` account
 * here from every other protected route; this screen's actual password-
 * change form/UX/copy is KAN-155's job (FR6-8, NFR9) — it is deliberately
 * left thin so that story can build it out without fighting this one.
 */
export function ChangePassword() {
  const { account } = useAuth()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8">
      <h1
        className="text-xl font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        Password change required
      </h1>
      <p
        data-testid="change-password-placeholder"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {account?.mail ? `${account.mail} — ` : ''}
        your account requires a new password before continuing.
      </p>
    </main>
  )
}
