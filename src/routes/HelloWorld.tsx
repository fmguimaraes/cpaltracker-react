import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PageTitle } from '../chrome/PageTitle'
import { useThemeStore } from '../store/themeStore'

export function HelloWorld() {
  const { status, account, error, logout } = useAuth()
  const { theme, toggleTheme } = useThemeStore()
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  const [loggingOut, setLoggingOut] = useState(false)

  /**
   * KAN-156 (FR10) — the explicit, authenticated action that triggers
   * logout. `logout()` itself already always clears local auth state (its
   * own `finally`, see AuthContext) even if the server call fails, so there
   * is nothing further to do on a thrown `ApiError` here — it's swallowed
   * rather than surfaced, since by the time it could throw the user is
   * already signed out locally and `RequireAuth` is about to redirect them
   * to `/login?notice=logged-out`.
   *
   * Review gate round 1: disabling the button while a logout is in flight
   * avoids sending a second POST with an already-consumed token in the
   * first place. `AuthContext`'s own token-identity guard (B1) narrows the
   * blast radius of a duplicate call in the common response ordering, but
   * does not make every ordering harmless on its own (round 2 review: a
   * reversed-arrival double logout can still surface a 'session-expired'
   * notice instead of 'logged-out', safely but incorrectly labeled) — the
   * disabled button is what actually prevents the duplicate call from being
   * sent at all.
   */
  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // See doc comment above — intentionally ignored.
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <PageTitle>cpaltracker-react</PageTitle>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            data-testid="theme-toggle"
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
            }}
          >
            {theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          </button>
          {status === 'authenticated' && (
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              data-testid="logout-button"
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text)',
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <section
        className="rounded-lg border p-4"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
        }}
        data-testid="connectivity-status"
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          /api/v1 target: <code>{baseUrl}</code>
        </p>

        {status === 'loading' && <p>Connecting to /api/v1…</p>}

        {status === 'authenticated' && account && (
          <p data-testid="connected">
            Connected to /api/v1 — signed in as <strong>{account.mail}</strong>.
          </p>
        )}

        {status === 'anonymous' && !error && (
          <p data-testid="connected">
            Connected to /api/v1 — not signed in (401 as expected for an
            anonymous request).
          </p>
        )}

        {status === 'anonymous' && error && (
          <p data-testid="connection-error" style={{ color: 'var(--color-danger)' }}>
            Could not reach /api/v1: {error}
          </p>
        )}
      </section>
    </main>
  )
}
