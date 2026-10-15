import { useAuth } from '../auth/AuthContext'
import { useThemeStore } from '../store/themeStore'

export function HelloWorld() {
  const { status, account, error } = useAuth()
  const { theme, toggleTheme } = useThemeStore()
  const baseUrl = import.meta.env.VITE_API_BASE_URL

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          cpaltracker-react
        </h1>
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
            Connected to /api/v1 — signed in as <strong>{account.email}</strong>.
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
