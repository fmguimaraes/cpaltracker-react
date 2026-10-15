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

describe('AuthContext isAdmin (FR15)', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false while there is no account (loading/anonymous)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )
    const probe = renderProbe()
    expect(probe.auth.isAdmin).toBe(false)
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))
    expect(probe.auth.isAdmin).toBe(false)
  })

  it('is true only when the bootstrapped account has role "admin"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            account: {
              ...accountSummary,
              role: 'admin',
              telephone: null,
              lastLoginAt: null,
            },
          }),
          { status: 200 },
        ),
      ),
    )
    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))
    expect(probe.auth.isAdmin).toBe(true)
  })

  it('is false for a non-admin role', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            account: { ...accountSummary, telephone: null, lastLoginAt: null },
          }),
          { status: 200 },
        ),
      ),
    )
    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))
    expect(probe.auth.isAdmin).toBe(false)
  })
})

/**
 * KAN-151 — NFR3 / client-side security constraints regression guard.
 *
 * `/api/v1` is bearer-token, not cookie-session (stack decision §3, §7).
 * NFR3's literal ask ("never store credentials or session secrets in
 * localStorage/sessionStorage or app logs") still applies to this model: the
 * token must stay in `client.ts`'s in-memory module variable and never leak
 * to persistent storage, the DOM, or a logged error message. FR9's "CSRF
 * token" ask does not translate to this architecture (no cookie session to
 * protect) — see §7 of the stack decision for the full reconciliation.
 */
describe('AuthContext token handling (NFR3)', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setAuthToken(null)
  })

  it('never persists the issued token to localStorage/sessionStorage across a full login→logout cycle', async () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                token: 'highly-sensitive-token',
                expiresAt: '2026-10-16T00:00:00Z',
                account: accountSummary,
              }),
              { status: 200 },
            ),
          )
        }
        if (url.includes('/auth/logout.php')) {
          return Promise.resolve(new Response(null, { status: 204 }))
        }
        return Promise.resolve(new Response(null, { status: 401 }))
      }),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    await act(async () => {
      await probe.auth.login('demo@cpal.test', 'password')
    })
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    await act(async () => {
      await probe.auth.logout()
    })
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    for (const call of localSetSpy.mock.calls) {
      expect(call.join(' ')).not.toContain('highly-sensitive-token')
    }
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)

    localSetSpy.mockRestore()
  })

  it('never logs the token via console.error when a login request fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'invalid_credentials', message: 'Invalid email or password.' },
          }),
          { status: 401 },
        ),
      ),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    await act(async () => {
      await expect(
        probe.auth.login('demo@cpal.test', 'wrong-password'),
      ).rejects.toThrow()
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })
})
