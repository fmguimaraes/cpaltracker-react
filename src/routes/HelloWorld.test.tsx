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
})
