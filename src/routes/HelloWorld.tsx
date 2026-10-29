import { useAuth } from '../auth/AuthContext'
import { Card, CardContent } from '@/ui/card'
import { PageHeader } from '@/ui/patterns/page-header'
import { Spinner } from '@/ui/spinner'

export function HelloWorld() {
  const { status, account, error } = useAuth()
  const baseUrl = import.meta.env.VITE_API_BASE_URL

  return (
    <div>
      {/* Sign out (logout-button, KAN-156 FR10) lives once, in the shell user menu (KAN-224 FR6). */}
      <PageHeader title="cpaltracker-react" />

      <div className="mx-auto max-w-2xl p-4 md:p-6">
        <Card data-testid="connectivity-status">
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              /api/v1 target: <code>{baseUrl}</code>
            </p>

            {status === 'loading' && (
              <p className="flex items-center gap-2">
                <Spinner aria-hidden="true" />
                Connecting to /api/v1…
              </p>
            )}

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
              <p data-testid="connection-error" className="text-danger">
                Could not reach /api/v1: {error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
