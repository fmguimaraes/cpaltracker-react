import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken } from '../api/client'
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
