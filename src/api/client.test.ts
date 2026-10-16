import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, fetchBinary, setAuthToken, setSessionLossHandler } from './client'

/**
 * KAN-151 — CSRF Token Lifecycle & Client-Side Security Constraints.
 *
 * FR9 ("obtain a CSRF token at bootstrap, send it on every state-changing
 * auth request, refresh it on failure") is written against the legacy PHP
 * monolith's cookie-session model (CB3, CB18, CB24 — see
 * `Auth-and-Session.md` technical doc). `/api/v1` is bearer-token only and
 * never relies on cookies (`api/v1/_lib.php`: no
 * `Access-Control-Allow-Credentials`; `openapi.yaml`: `bearerAuth` only, no
 * CSRF field anywhere in the login/logout schemas) — see
 * `react-frontend-stack-decision.md` §6 for the full reconciliation. There is
 * no cookie-borne ambient credential for a forged cross-site request to
 * piggyback on, so there is nothing for a conventional CSRF token to defend;
 * implementing a double-submit-cookie scheme here would be dead code
 * asserting a protection against an attack this architecture isn't exposed
 * to. FR9's *security intent* — never let an ambient browser credential
 * ride along on a request this app didn't knowingly originate — is already
 * satisfied structurally by `credentials: 'omit'` plus the explicit
 * `Authorization: Bearer` header. These tests lock that down as a regression
 * guard: nothing may silently start sending cookies, and nothing may
 * resurrect a CSRF-token header/body field that the real backend never
 * validates.
 */

function lastRequestInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  const [, init] = fetchMock.mock.calls.at(-1) as [RequestInfo | URL, RequestInit]
  return init
}

describe('apiClient request security constraints (FR9, NFR3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthToken(null)
  })

  it('always sends credentials: "omit" on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.post('/auth/login.php', { email: 'a@b.test', password: 'x' })

    const init = lastRequestInit(fetchMock)
    expect(init.credentials).toBe('omit')
  })

  it('never attaches a CSRF token header or body field — the API has none to validate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.post('/auth/login.php', { email: 'a@b.test', password: 'x' })
    // Review gate round 3 (A3): set a token before logout so the
    // `authorization` branch of the allowlist below is actually exercised —
    // without this, both calls ran unauthenticated and that entry was never
    // tested.
    setAuthToken('demo-token')
    await apiClient.post('/auth/logout.php')

    // Allowlist, not a denylist of known CSRF header names (review gate A4):
    // Content-Type/Authorization per `api/v1/_lib.php`'s Allow-Headers, plus
    // Accept (CORS-safelisted, not backend-granted) — the only three headers
    // this client ever sends — so the test fails on *any* unexpected header,
    // not just ones we thought to name.
    const allowedHeaders = new Set(['accept', 'content-type', 'authorization'])
    for (const call of fetchMock.mock.calls) {
      const init = call[1] as RequestInit
      const headers = new Headers(init.headers)
      for (const name of headers.keys()) {
        expect(allowedHeaders.has(name)).toBe(true)
      }
      if (typeof init.body === 'string') {
        expect(init.body).not.toMatch(/csrf/i)
      }
    }
  })

  it('attaches Authorization: Bearer only when a token is set, and omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    setAuthToken(null)
    await apiClient.get('/account.php')
    let headers = new Headers(lastRequestInit(fetchMock).headers)
    expect(headers.has('Authorization')).toBe(false)

    setAuthToken('demo-token')
    await apiClient.get('/account.php')
    headers = new Headers(lastRequestInit(fetchMock).headers)
    expect(headers.get('Authorization')).toBe('Bearer demo-token')
  })

  it('never persists the bearer token to localStorage or sessionStorage (NFR3)', async () => {
    const localSetSpy = vi.spyOn(Storage.prototype, 'setItem')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    setAuthToken('super-secret-token')
    await apiClient.get('/account.php')

    for (const call of localSetSpy.mock.calls) {
      expect(call.join(' ')).not.toContain('super-secret-token')
    }
    // Asserting against a single invented key name ("authToken") is not a
    // real guard (review gate B1): assert nothing was written at all.
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})

/**
 * KAN-156 — FR11/FR12 shared session-loss interceptor. See
 * `react-frontend-stack-decision.md` §8 for why requiring a token that's
 * STILL the current one (not just "a token was sent", review gate round 1's
 * B1) plus code `'unauthorized'` (not just any 401) is the real,
 * narrowest-correct trigger condition against the actual `/api/v1` contract.
 */
describe('apiClient session-loss interceptor (FR11, FR12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthToken(null)
    setSessionLossHandler(null)
  })

  it('fires the registered handler on a 401 "unauthorized" response to a request that carried a bearer token', async () => {
    const handler = vi.fn()
    setSessionLossHandler(handler)
    setAuthToken('a-previously-valid-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
          { status: 401 },
        ),
      ),
    )

    await expect(apiClient.get('/account.php')).rejects.toThrow()

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire for a 401 "unauthorized" response to a request that carried no token (a never-signed-in visitor\'s first bootstrap call)', async () => {
    // This is the regression this test guards against: without requiring a
    // token to have been sent, every anonymous visitor's very first page
    // load would be mislabeled "your session expired" even though nothing
    // was ever authenticated.
    const handler = vi.fn()
    setSessionLossHandler(handler)
    setAuthToken(null)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
          { status: 401 },
        ),
      ),
    )

    await expect(apiClient.get('/account.php')).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire for a 401 "invalid_credentials" response (a rejected login attempt, not a session loss)', async () => {
    const handler = vi.fn()
    setSessionLossHandler(handler)
    // A rejected login never carries a token in the first place, but assert
    // the code check too: even if a stale token happened to be set, a
    // login-rejection code must never be treated as session loss.
    setAuthToken('irrelevant-stale-token')
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

    await expect(
      apiClient.post('/auth/login.php', { email: 'a@b.test', password: 'wrong' }),
    ).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire for a non-401 error (e.g. 503 service_unavailable) even with a token set', async () => {
    const handler = vi.fn()
    setSessionLossHandler(handler)
    setAuthToken('a-previously-valid-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'service_unavailable', message: 'Unavailable' } }),
          { status: 503 },
        ),
      ),
    )

    await expect(apiClient.get('/account.php')).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })

  it('never fires on a successful response', async () => {
    const handler = vi.fn()
    setSessionLossHandler(handler)
    setAuthToken('a-valid-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ account: {} }), { status: 200 })),
    )

    await apiClient.get('/account.php')

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire for a stale 401 whose token has since been replaced by a newer login (review gate round 1, B1)', async () => {
    // A slow request sent with T1 must not be allowed to declare session
    // loss once T1 is no longer the current token — whether because a
    // newer login already installed T2, or because an explicit logout
    // already cleared it. Without comparing the token at response time
    // against the token the request actually sent, a stale 401 would wipe
    // out whatever session is current now.
    const handler = vi.fn()
    setSessionLossHandler(handler)
    setAuthToken('T1-now-stale')

    let resolveFetch!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve))),
    )

    const pending = apiClient.get('/account.php')

    // A newer login replaces the token while T1's request is still in flight.
    setAuthToken('T2-current')

    resolveFetch(
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
        { status: 401 },
      ),
    )
    await expect(pending).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })

  it('does NOT fire for a stale 401 whose token has since been cleared by an explicit logout (review gate round 1, B1)', async () => {
    const handler = vi.fn()
    setSessionLossHandler(handler)
    setAuthToken('T1-now-stale')

    let resolveFetch!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve))),
    )

    const pending = apiClient.get('/account.php')
    setAuthToken(null) // an explicit logout completes while T1's request is still in flight

    resolveFetch(
      new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' } }),
        { status: 401 },
      ),
    )
    await expect(pending).rejects.toThrow()

    expect(handler).not.toHaveBeenCalled()
  })
})

describe('fetchBinary (KAN-165 FR13)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthToken(null)
  })

  it('sends credentials: "omit" and the bearer token, same as apiClient', async () => {
    setAuthToken('a-token')
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['x']), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchBinary('/clients/logo.php')

    const init = lastRequestInit(fetchMock)
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer a-token')
  })

  it('throws the parsed error body on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'not_found', message: 'Logo not found.' } }), {
          status: 404,
        }),
      ),
    )

    await expect(fetchBinary('/clients/logo.php')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
  })
})
