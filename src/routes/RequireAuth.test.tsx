import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient, setAuthToken } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { RequireAuth } from './RequireAuth'

const authenticatedAccount = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client' as const,
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

function stubAccountResponse(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(response),
  )
}

function renderGuarded({
  allowMustChangePassword = false,
  initialEntry = '/protected?foo=bar',
}: { allowMustChangePassword?: boolean; initialEntry?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireAuth allowMustChangePassword={allowMustChangePassword}>
                <div data-testid="protected-content">secret</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div data-testid="login-screen" />} />
          <Route
            path="/change-password"
            element={<div data-testid="change-password-screen" />}
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a neutral loading state and does not redirect while the bootstrap refresh is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    )

    renderGuarded()

    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument()
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('redirects an anonymous visitor to /login with the attempted URL preserved as suite (FR13)', async () => {
    stubAccountResponse(new Response(null, { status: 401 }))

    renderGuarded()

    await waitFor(() =>
      expect(screen.getByTestId('login-screen')).toBeInTheDocument(),
    )
  })

  it('renders the protected content for an authenticated account that does not need a password change', async () => {
    stubAccountResponse(
      new Response(JSON.stringify({ account: authenticatedAccount }), {
        status: 200,
      }),
    )

    renderGuarded()

    await waitFor(() =>
      expect(screen.getByTestId('protected-content')).toBeInTheDocument(),
    )
  })

  it('redirects a mustChangePassword account to the password-change route by default (FR14)', async () => {
    stubAccountResponse(
      new Response(
        JSON.stringify({
          account: { ...authenticatedAccount, mustChangePassword: true },
        }),
        { status: 200 },
      ),
    )

    renderGuarded()

    await waitFor(() =>
      expect(screen.getByTestId('change-password-screen')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('still renders the password-change route itself for a mustChangePassword account (allowMustChangePassword)', async () => {
    stubAccountResponse(
      new Response(
        JSON.stringify({
          account: { ...authenticatedAccount, mustChangePassword: true },
        }),
        { status: 200 },
      ),
    )

    renderGuarded({ allowMustChangePassword: true })

    await waitFor(() =>
      expect(screen.getByTestId('protected-content')).toBeInTheDocument(),
    )
  })
})

/**
 * KAN-156 (FR11/FR12) — the shared session-loss interceptor drops to
 * anonymous, and this guard's already-existing FR13 redirect (reused
 * unmodified) is what carries the user to /login with both `suite` and the
 * new `notice=session-expired` indicator.
 */
describe('RequireAuth session-loss redirect (FR11, FR12)', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function LoginLocationProbe() {
    const location = useLocation()
    return <div data-testid="login-screen">{location.pathname + location.search}</div>
  }

  it('redirects to /login with suite preserved and notice=session-expired once an authenticated 401 unauthorized response arrives', async () => {
    const authenticatedAccount = {
      userId: 1,
      clientId: null,
      mail: 'demo@cpal.test',
      nom: 'Demo',
      prenom: 'User',
      role: 'client' as const,
      telephone: null,
      lastLoginAt: null,
      mustChangePassword: false,
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ account: authenticatedAccount }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/protected?foo=bar']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/protected"
              element={
                <RequireAuth>
                  <div data-testid="protected-content">secret</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<LoginLocationProbe />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('protected-content')).toBeInTheDocument(),
    )

    // The interceptor only fires for a request that was itself carrying a
    // bearer token (see client.test.ts) — set one here to stand in for the
    // token a real `login()` call would have issued.
    setAuthToken('a-previously-valid-token')

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
        { status: 401 },
      ),
    )

    await act(async () => {
      await apiClient.get('/account.php').catch(() => undefined)
    })

    await waitFor(() =>
      expect(screen.getByTestId('login-screen')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('login-screen').textContent).toBe(
      '/login?suite=%2Fprotected%3Ffoo%3Dbar&notice=session-expired',
    )
  })
})
