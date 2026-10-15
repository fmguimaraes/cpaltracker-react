import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, setAuthToken } from './client'

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
    await apiClient.post('/auth/logout.php')

    // Allowlist, not a denylist of known CSRF header names (review gate A4):
    // this is exactly the set `api/v1/_lib.php`'s CORS allowlist admits, so
    // the test fails on *any* unexpected header, not just ones we thought to
    // name.
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
