import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { setAuthToken } from '../api/client'
import { ThemeProvider } from '@/app/theme'
import { HelloWorld } from './HelloWorld'

function renderHelloWorld() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <HelloWorld />
      </AuthProvider>
    </ThemeProvider>,
  )
}

/** jsdom has no matchMedia; ThemeProvider reads prefers-color-scheme through it. */
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  )
}

describe('HelloWorld', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
    setAuthToken(null)
    stubMatchMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a connected state once the anonymous /api/v1 request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
          { status: 401 },
        ),
      ),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent(
        'not signed in',
      ),
    )
  })

  it('renders an authenticated account when /api/v1/account.php succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            account: {
              userId: 1,
              clientId: null,
              mail: 'demo@cpal.test',
              nom: 'Demo',
              prenom: 'User',
              role: 'client',
              telephone: null,
              lastLoginAt: null,
              mustChangePassword: false,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent(
        'demo@cpal.test',
      ),
    )
  })

  it('sends a bearer token and no cookies, never credentials: include', async () => {
    setAuthToken('test-token')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    renderHelloWorld()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    )
  })

  it('surfaces a structured error body as a readable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'service_unavailable', message: 'Backend is down' },
          }),
          { status: 503 },
        ),
      ),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connection-error')).toHaveTextContent(
        'Backend is down',
      ),
    )
  })

  it('clears local session state even when the logout request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )

    let auth: ReturnType<typeof useAuth> | null = null
    function Probe() {
      auth = useAuth()
      return null
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(auth?.status).toBe('anonymous'))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    setAuthToken('stale-token')

    await act(async () => {
      await expect(auth!.logout()).rejects.toThrow('Failed to fetch')
    })
    expect(auth!.status).toBe('anonymous')
    expect(auth!.account).toBeNull()
  })

  it('renders no sign-out control of its own: logout-button lives once, in the shell user menu (KAN-224 FR6)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            account: {
              userId: 1,
              clientId: null,
              mail: 'demo@cpal.test',
              nom: 'Demo',
              prenom: 'User',
              role: 'client',
              telephone: null,
              lastLoginAt: null,
              mustChangePassword: false,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent('demo@cpal.test'),
    )
    expect(screen.queryByTestId('logout-button')).not.toBeInTheDocument()
  })
})
