import { act, render, waitFor } from '@testing-library/react'
import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient, getAuthToken, setAuthToken } from '../api/client'
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
 * `/api/v1` is bearer-token, not cookie-session (stack decision §3, §6).
 * NFR3's literal ask ("never store credentials or session secrets in
 * localStorage/sessionStorage or app logs") still applies to this model: the
 * token must stay in `client.ts`'s in-memory module variable and never leak
 * to persistent storage, the DOM, or a logged error message. FR9's "CSRF
 * token" ask does not translate to this architecture (no cookie session to
 * protect) — see §6 of the stack decision for the full reconciliation.
 */
describe('AuthContext token handling (NFR3)', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
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
  })

  it('never logs the issued token via console across a full login→logout cycle (review gate round 1: a failed-login-only test cannot catch a logging regression, since no token is ever issued on that path)', async () => {
    const consoleSpies = [
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'debug').mockImplementation(() => {}),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                token: 'never-logged-token',
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

    // Review gate round 2 (B1): `call.join(' ')` coerces an object argument
    // to "[object Object]", so `console.log('login', { token })` — the most
    // realistic way a token leaks — would have passed undetected.
    // `util.inspect(..., { depth: null })` expands nested values instead.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(inspect(call, { depth: null })).not.toContain('never-logged-token')
      }
    }
  })

  it('clears a stale token on a failed refresh, so it is never sent on a later request (review gate round 3, A1)', async () => {
    setAuthToken('stale-token-from-a-previous-session')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'unauthorized', message: 'Token expired' } }),
          { status: 401 },
        ),
      ),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    vi.mocked(fetch).mockClear()
    await apiClient.get('/account.php').catch(() => undefined)

    const [, init] = vi.mocked(fetch).mock.calls.at(-1) as [RequestInfo | URL, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.has('Authorization')).toBe(false)
  })
})

/**
 * KAN-156 — FR10 (explicit POST-only logout, clears AuthContext, sets the
 * 'logged-out' notice) and FR11/FR12 (shared session-loss interceptor drops
 * an authenticated session and sets the 'session-expired' notice).
 */
describe('AuthContext logout (FR10)', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthToken(null)
  })

  it('issues a POST to /auth/logout.php — never GET — and the only call site in the app is this one', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/login.php')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              token: 'a-token',
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
    })
    vi.stubGlobal('fetch', fetchMock)

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    await act(async () => {
      await probe.auth.login('demo@cpal.test', 'password')
    })
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    await act(async () => {
      await probe.auth.logout()
    })

    const logoutCall = fetchMock.mock.calls.find(([input]) => {
      const url = typeof input === 'string' ? input : input.toString()
      return url.includes('/auth/logout.php')
    })
    expect(logoutCall).toBeDefined()
    const [, init] = logoutCall as unknown as [RequestInfo | URL, RequestInit]
    expect(init.method).toBe('POST')
  })

  it('clears AuthContext (status, account, token) and sets the logged-out notice once the POST completes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                token: 'a-token',
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
    expect(probe.auth.notice).toBeNull()

    await act(async () => {
      await probe.auth.logout()
    })

    expect(probe.auth.status).toBe('anonymous')
    expect(probe.auth.account).toBeNull()
    expect(probe.auth.notice).toBe('logged-out')
  })

  it('a slow logout settling after a newer login must not wipe out the newer token (review gate round 1, B1)', async () => {
    // Covers the token-identity precondition behind the round-1 logout race:
    // `finally` used to call setAuthToken(null) unconditionally, so a slow
    // logout call that settles after the user has already logged back in
    // (got a new token) would erase that newer token out from under them.
    // (Review gate round 2: this exercises the "logout settles after a later
    // login" ordering specifically, not the double-logout race — see
    // HelloWorld's own test for that one.)
    let resolveLogout!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                token: 'T2',
                expiresAt: '2026-10-16T00:00:00Z',
                account: accountSummary,
              }),
              { status: 200 },
            ),
          )
        }
        if (url.includes('/auth/logout.php')) {
          return new Promise<Response>((resolve) => (resolveLogout = resolve))
        }
        return Promise.resolve(new Response(null, { status: 401 }))
      }),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    setAuthToken('T1-about-to-be-superseded')
    const logoutPending = probe.auth.logout()

    // While that logout POST is still in flight, the user logs back in and
    // is issued a new token, T2.
    await act(async () => {
      await probe.auth.login('demo@cpal.test', 'password')
    })
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    // The original, now-superseded logout call finally settles.
    resolveLogout(new Response(null, { status: 204 }))
    await act(async () => {
      await logoutPending
    })

    // T2 must still be the live token — assert indirectly via a fresh
    // authenticated call actually carrying an Authorization header, rather
    // than reading `getAuthToken()` directly, so this test still proves the
    // token is actually *used*, not just stored.
    vi.mocked(fetch).mockClear()
    await apiClient.get('/account.php').catch(() => undefined)
    const [, init] = vi.mocked(fetch).mock.calls.at(-1) as [RequestInfo | URL, RequestInit]
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer T2')
  })
})

describe('AuthContext session-loss interceptor (FR11, FR12)', () => {
  beforeEach(() => {
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthToken(null)
  })

  it('drops an authenticated session to anonymous with the session-expired notice when any later /api/v1 call comes back 401 unauthorized', async () => {
    // Review gate self-check: this test would fail to prove anything if the
    // interceptor were a no-op, since nothing else in this flow sets
    // `notice` to 'session-expired' — only `handleSessionLoss` does.
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                token: 'a-token',
                expiresAt: '2026-10-16T00:00:00Z',
                account: accountSummary,
              }),
              { status: 200 },
            ),
          )
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

    // Reconfigure the mock: the next authenticated-only account.php response
    // signals token invalidation server-side (idle timeout, absolute
    // timeout, account disabled, or epoch mismatch — all the same single
    // `401 unauthorized` wire signal per stack-decision.md §8).
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
        { status: 401 },
      ),
    )

    await act(async () => {
      await apiClient.get('/account.php').catch(() => undefined)
    })

    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))
    expect(probe.auth.account).toBeNull()
    expect(probe.auth.notice).toBe('session-expired')
  })

  it('never fires for the initial anonymous bootstrap (no prior session to lose)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
          { status: 401 },
        ),
      ),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    expect(probe.auth.notice).toBeNull()
  })

  it('a stale request for a since-replaced token does not wipe out a newer, already-successful login (review gate round 1, B1)', async () => {
    // Covers the token-identity precondition behind the round-1 session-loss
    // race: a slow authenticated call sent with T1 must not retroactively
    // declare session loss once the user has already logged back in and is
    // authenticated with T2. (Review gate round 2: this exercises "the stale
    // call settles after a later login already finished" — not the narrower
    // "stale 401 lands while that later login is still pending" ordering,
    // which the client.ts-level test below covers via a direct `authToken`
    // comparison instead of a full AuthContext render.)
    let resolveStaleCall!: (response: Response) => void
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/login.php')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              token: 'T2',
              expiresAt: '2026-10-16T00:00:00Z',
              account: accountSummary,
            }),
            { status: 200 },
          ),
        )
      }
      if (url.includes('/account.php')) {
        // The very first bootstrap call (no token yet) settles immediately
        // as anonymous; a later, authenticated call is held open until the
        // test resolves it explicitly, simulating a slow in-flight request.
        const headers = new Headers(init?.headers)
        if (!headers.has('Authorization')) {
          return Promise.resolve(new Response(null, { status: 401 }))
        }
        return new Promise<Response>((resolve) => (resolveStaleCall = resolve))
      }
      return Promise.resolve(new Response(null, { status: 401 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    // Simulate an already-authenticated session with T1 by logging in once...
    setAuthToken('T1-stale')
    // ...then fire off a slow authenticated call that won't resolve until
    // later (captured in resolveStaleCall), while T1 is still current.
    const stalePending = apiClient.get('/account.php').catch(() => undefined)

    // The user logs in again (e.g. after an unrelated, already-handled
    // session loss) and gets a new token, T2.
    await act(async () => {
      await probe.auth.login('demo@cpal.test', 'password')
    })
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))
    expect(probe.auth.notice).toBeNull()

    // T1's slow request finally settles — as a 401 unauthorized, since T1 is
    // no longer valid server-side. It must be treated as stale, not as a
    // session loss for the CURRENT (T2) session.
    resolveStaleCall(
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
        { status: 401 },
      ),
    )
    await act(async () => {
      await stalePending
    })

    expect(probe.auth.status).toBe('authenticated')
    expect(probe.auth.notice).toBeNull()
  })

  it('a second stale 401 landing while a re-login is still pending does not get that re-login discarded as superseded (review gate round 2: exact race 2)', async () => {
    // Exact reviewer-reproduced ordering: R0 and R1 are both sent with T1.
    // R0's 401 arrives first and triggers a real session loss (clearing the
    // token, bumping requestId). The user starts a new login, which stays
    // pending. R1's 401 then arrives *while that login is still in flight*
    // — by now the token is already null, so the token-identity guard must
    // treat R1 as stale too, instead of bumping requestId a second time and
    // getting the still-pending login discarded as superseded. Only after
    // that does the login resolve with T2.
    let resolveR0!: (response: Response) => void
    let resolveR1!: (response: Response) => void
    let resolveLogin!: (response: Response) => void
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/login.php')) {
        return new Promise<Response>((resolve) => (resolveLogin = resolve))
      }
      if (url.includes('/account.php')) {
        const headers = new Headers(init?.headers)
        if (!headers.has('Authorization')) {
          return Promise.resolve(new Response(null, { status: 401 }))
        }
        if (!resolveR0) {
          return new Promise<Response>((resolve) => (resolveR0 = resolve))
        }
        return new Promise<Response>((resolve) => (resolveR1 = resolve))
      }
      return Promise.resolve(new Response(null, { status: 401 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('anonymous'))

    setAuthToken('T1')
    const r0Pending = apiClient.get('/account.php').catch(() => undefined)
    const r1Pending = apiClient.get('/account.php').catch(() => undefined)

    const unauthorized = () =>
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
        { status: 401 },
      )

    // R0 settles first: a real session loss.
    resolveR0(unauthorized())
    await act(async () => {
      await r0Pending
    })
    expect(probe.auth.status).toBe('anonymous')
    expect(probe.auth.notice).toBe('session-expired')

    const loginPending = probe.auth.login('demo@cpal.test', 'password')

    // R1 settles second, while the login above is still pending.
    resolveR1(unauthorized())
    await act(async () => {
      await r1Pending
    })

    resolveLogin(
      new Response(
        JSON.stringify({
          token: 'T2',
          expiresAt: '2026-10-16T00:00:00Z',
          account: accountSummary,
        }),
        { status: 200 },
      ),
    )
    await act(async () => {
      await loginPending
    })

    expect(probe.auth.status).toBe('authenticated')
    expect(probe.auth.notice).toBeNull()
  })
})

describe('AuthContext updateAccount (KAN-152, FR11-FR14, GAP5)', () => {
  const fullAccount = {
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

  beforeEach(() => {
    setAuthToken(null)
  })

  it('applies the PATCH response\'s full Account object and transparently re-authenticates after a password change', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/account.php') && init?.method === 'PATCH') {
          calls.push('patch')
          expect(JSON.parse(init.body as string)).toEqual({
            currentPassword: 'old-pw',
            password: 'new-pw',
            passwordConfirmation: 'new-pw',
          })
          return Promise.resolve(
            new Response(
              JSON.stringify({ account: { ...fullAccount, lastLoginAt: '2026-10-16 09:00:00' } }),
              { status: 200 },
            ),
          )
        }
        if (url.includes('/auth/login.php')) {
          calls.push('login')
          expect(JSON.parse(init!.body as string)).toEqual({
            email: 'demo@cpal.test',
            password: 'new-pw',
          })
          return Promise.resolve(
            new Response(
              JSON.stringify({ token: 'FRESH-TOKEN', expiresAt: '2026-10-16T10:00:00Z', account: fullAccount }),
              { status: 200 },
            ),
          )
        }
        if (url.includes('/account.php')) {
          return Promise.resolve(
            new Response(JSON.stringify({ account: fullAccount }), { status: 200 }),
          )
        }
        throw new Error(`Unexpected fetch: ${url}`)
      }),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    await act(async () => {
      await probe.auth.updateAccount({
        currentPassword: 'old-pw',
        password: 'new-pw',
        passwordConfirmation: 'new-pw',
      })
    })

    expect(calls).toEqual(['patch', 'login'])
    expect(probe.auth.account?.lastLoginAt).toBe('2026-10-16 09:00:00')
    expect(getAuthToken()).toBe('FRESH-TOKEN')
  })

  it('does not call login.php again for a phone or e-mail change', async () => {
    const loginCalls: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          loginCalls.push(url)
          return Promise.reject(new Error('should not be called'))
        }
        if (url.includes('/account.php') && init?.method === 'PATCH') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ account: { ...fullAccount, telephone: '+33612345678' } }),
              { status: 200 },
            ),
          )
        }
        return Promise.resolve(new Response(JSON.stringify({ account: fullAccount }), { status: 200 }))
      }),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    await act(async () => {
      await probe.auth.updateAccount({ currentPassword: 'old-pw', phone: '+33612345678' })
    })

    expect(loginCalls).toEqual([])
    expect(probe.auth.account?.telephone).toBe('+33612345678')
  })

  it('still resolves successfully, and leaves the stale token in place, when the post-password-change re-authentication itself fails (best-effort only)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/account.php') && init?.method === 'PATCH') {
          return Promise.resolve(
            new Response(JSON.stringify({ account: fullAccount }), { status: 200 }),
          )
        }
        if (url.includes('/auth/login.php')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: { code: 'service_unavailable', message: 'Down' } }),
              { status: 503 },
            ),
          )
        }
        return Promise.resolve(new Response(JSON.stringify({ account: fullAccount }), { status: 200 }))
      }),
    )
    setAuthToken('STALE-TOKEN')

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    await act(async () => {
      await expect(
        probe.auth.updateAccount({
          currentPassword: 'old-pw',
          password: 'new-pw',
          passwordConfirmation: 'new-pw',
        }),
      ).resolves.toBeUndefined()
    })

    expect(getAuthToken()).toBe('STALE-TOKEN')
  })

  it('rethrows the PATCH failure as-is and never calls login.php when the account action itself is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('/auth/login.php')) {
          return Promise.reject(new Error('should not be called'))
        }
        if (url.includes('/account.php') && init?.method === 'PATCH') {
          return Promise.resolve(
            new Response(
              JSON.stringify({ error: { code: 'invalid_credentials', message: 'Mot de passe actuel incorrect.' } }),
              { status: 401 },
            ),
          )
        }
        return Promise.resolve(new Response(JSON.stringify({ account: fullAccount }), { status: 200 }))
      }),
    )

    const probe = renderProbe()
    await waitFor(() => expect(probe.auth.status).toBe('authenticated'))

    await act(async () => {
      await expect(
        probe.auth.updateAccount({
          currentPassword: 'wrong',
          password: 'new-pw',
          passwordConfirmation: 'new-pw',
        }),
      ).rejects.toThrow()
    })
  })
})
