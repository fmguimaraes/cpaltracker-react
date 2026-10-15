import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAuthToken } from '../api/client'
import { AuthProvider, useAuth } from './AuthContext'

const accountSummary = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client' as const,
  mustChangePassword: false,
}

function renderProbe() {
  let auth!: ReturnType<typeof useAuth>
  function Probe() {
    auth = useAuth()
    return null
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  return {
    get auth() {
      return auth
    },
  }
}

describe('AuthContext login()', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  it('rejects, and never applies the token/account, when a login resolves successfully after being superseded by a newer login', async () => {
    let resolveFirstLogin: (value: { token: string; expiresAt: string } & typeof accountSummary) => void =
      () => {}

    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          call += 1
          if (call === 1) {
            return new Promise<Response>((resolve) => {
              resolveFirstLogin = (body) =>
                resolve(new Response(JSON.stringify(body), { status: 200 }))
            })
          }
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: { code: 'invalid_credentials', message: 'Invalid email or password.' },
              }),
              { status: 401 },
            ),
          )
        }
        return Promise.resolve(new Response(null, { status: 401 }))
      }),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    // fire the first (slow) login — do not await it yet
    let firstLogin!: ReturnType<typeof probe.auth.login>
    act(() => {
      firstLogin = probe.auth.login('demo@cpal.test', 'first-password')
    })

    // fire a second login before the first resolves — this supersedes it
    let secondLogin!: ReturnType<typeof probe.auth.login>
    await act(async () => {
      secondLogin = probe.auth.login('demo@cpal.test', 'second-password')
      await expect(secondLogin).rejects.toThrow()
    })
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    // now the stale first request resolves as a *success*
    await act(async () => {
      resolveFirstLogin({
        token: 'stale-token',
        expiresAt: '2026-10-16T00:00:00Z',
        ...accountSummary,
      })
      // the superseded success must reject, not resolve
      await expect(firstLogin).rejects.toThrow('superseded')
    })

    // and must never have applied the stale token/account
    expect(probe.auth.status).toBe('anonymous')
    expect(probe.auth.account).toBeNull()
  })

  it('settles status to anonymous on a failed login even when a slower bootstrap refresh is still pending', async () => {
    let resolveBootstrap: (value: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: { code: 'invalid_credentials', message: 'Invalid email or password.' },
              }),
              { status: 401 },
            ),
          )
        }
        // the /account.php bootstrap call never resolves during this test
        return new Promise<Response>((resolve) => {
          resolveBootstrap = resolve
        })
      }),
    )

    const probe = renderProbe()
    expect(probe.auth.status).toBe('loading')

    await act(async () => {
      await expect(
        probe.auth.login('demo@cpal.test', 'wrong-password'),
      ).rejects.toThrow()
    })
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    // the stale bootstrap finally resolves — must not reopen 'loading'
    await act(async () => {
      resolveBootstrap(new Response(null, { status: 401 }))
    })
    expect(probe.auth.status).toBe('anonymous')
  })
})
