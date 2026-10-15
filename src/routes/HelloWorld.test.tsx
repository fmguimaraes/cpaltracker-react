import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { setAuthToken } from '../api/client'
import { HelloWorld } from './HelloWorld'

function renderHelloWorld() {
  return render(
    <AuthProvider>
      <HelloWorld />
    </AuthProvider>,
  )
}

describe('HelloWorld', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
    setAuthToken(null)
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

  it('toggles the theme on click and persists it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )
    const user = userEvent.setup()
    renderHelloWorld()

    const toggle = screen.getByTestId('theme-toggle')
    expect(toggle).toHaveTextContent('Switch to dark')

    await user.click(toggle)

    expect(toggle).toHaveTextContent('Switch to light')
    expect(window.localStorage.getItem('cpaltracker:theme')).toBe('dark')
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

  /**
   * KAN-156 (FR10) — the explicit in-app logout action this story adds.
   */
  it('renders a "Sign out" button only once authenticated, and it issues an explicit POST on click', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/logout.php')) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      void init
      return Promise.resolve(
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
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent('demo@cpal.test'),
    )

    const logoutButton = screen.getByTestId('logout-button')
    await user.click(logoutButton)

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url = typeof input === 'string' ? input : input.toString()
          return url.includes('/auth/logout.php')
        }),
      ).toBe(true),
    )
    const logoutCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return url.includes('/auth/logout.php')
    }) as [RequestInfo | URL, RequestInit]
    expect(logoutCall[1].method).toBe('POST')
  })

  it('a double-click on "Sign out" sends exactly one logout POST (review gate round 2: race 3, double logout)', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/logout.php')) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      return Promise.resolve(
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
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent('demo@cpal.test'),
    )

    const logoutButton = screen.getByTestId('logout-button')
    // Fire both clicks before either POST settles — the button's own
    // `loggingOut`-disabled state (not AuthContext's token-identity guard,
    // which only narrows the blast radius of a race that already happened)
    // is what must prevent a second POST from ever being sent.
    await user.click(logoutButton)
    await user.click(logoutButton)

    await waitFor(() => expect(logoutButton).toBeDisabled())
    // Once logout actually completes, status flips to anonymous and the
    // button is unmounted entirely (see the "does not render ... while
    // anonymous" test above) rather than re-enabled.
    await waitFor(() => expect(screen.queryByTestId('logout-button')).not.toBeInTheDocument())

    const logoutCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return url.includes('/auth/logout.php')
    })
    expect(logoutCalls).toHaveLength(1)
  })

  it('does not render a "Sign out" button while anonymous (no authenticated session to end)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent('not signed in'),
    )
    expect(screen.queryByTestId('logout-button')).not.toBeInTheDocument()
  })
})
