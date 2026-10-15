import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../auth/AuthContext'
import { setAuthToken } from '../api/client'
import { Login } from './Login'

function StatusProbe() {
  const { status } = useAuth()
  return <div data-testid="auth-status">{status}</div>
}

function renderLogin({
  withStatusProbe = false,
  initialEntry = '/login',
} = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        {withStatusProbe && <StatusProbe />}
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div data-testid="home-screen" />} />
          <Route
            path="/contracts/42"
            element={<div data-testid="suite-target-screen" />}
          />
          <Route
            path="/change-password"
            element={<div data-testid="change-password-screen" />}
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

/**
 * The AuthProvider bootstrap effect fires a GET /account.php on mount
 * (same as HelloWorld.test.tsx) — every fetch mock here must answer both
 * that anonymous bootstrap call and the POST /auth/login.php submission.
 */
function mockFetchSequence(loginResponse: Response) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    void init
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/login.php')) {
      return Promise.resolve(loginResponse.clone())
    }
    return Promise.resolve(new Response(null, { status: 401 }))
  })
}

describe('Login', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a themed, labeled, keyboard-accessible login form (FR1, NFR5, NFR6)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(screen.getByLabelText('Email')).toBeVisible()
    expect(screen.getByLabelText('Password')).toBeVisible()
    expect(screen.getByTestId('login-submit')).toBeVisible()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('blocks submission and shows inline messages when email/password are empty, without issuing a request (FR5)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    // let the bootstrap anonymous call settle first
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-email-error')).toHaveTextContent(
      'Email is required.',
    )
    expect(screen.getByTestId('login-password-error')).toHaveTextContent(
      'Password is required.',
    )
    // no additional request beyond the bootstrap call was issued
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('submits credentials to POST /auth/login.php via the bearer-token client and redirects on success (FR4)', async () => {
    const fetchMock = mockFetchSequence(
      new Response(
        JSON.stringify({
          token: 'issued-token',
          expiresAt: '2026-10-16T00:00:00Z',
          account: {
            userId: 1,
            clientId: null,
            mail: 'demo@cpal.test',
            nom: 'Demo',
            prenom: 'User',
            role: 'client',
            mustChangePassword: false,
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'demo@cpal.test',
      password: 'correct-horse',
    })

    // the login screen navigates to home once AuthContext reports success
    await waitFor(() =>
      expect(screen.getByTestId('home-screen')).toBeInTheDocument(),
    )
  })

  it('shows the mapped generic rejection copy on invalid credentials, never the raw {error:{code,message}} body (FR7, anti-enumeration)', async () => {
    const fetchMock = mockFetchSequence(
      new Response(
        JSON.stringify({
          error: { code: 'invalid_credentials', message: 'Invalid email or password.' },
        }),
        { status: 401 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByTestId('login-submit'))

    // KAN-155: the mapped French copy, not the raw backend message — this
    // would still pass if Login.tsx rendered `err.message` verbatim unless
    // we also assert the raw text is absent.
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Adresse ou mot de passe incorrect.',
    )
    expect(screen.queryByText('Invalid email or password.')).not.toBeInTheDocument()
    // the form stays put — no navigation on failure
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
  })

  it('shows the generic rejection copy with no countdown on the 401 a locked account actually produces today (FR8)', async () => {
    // Review gate round 1 (A1): GAP4 is closed at the /api/v1 layer itself —
    // a locked account sends the exact same 401 invalid_credentials body as
    // wrong-password (see authOutcome.ts), so there is no distinct request
    // shape this test could send to prove a *separate* lockout branch wasn't
    // special-cased; that structural guarantee is covered instead by
    // authOutcome.test.ts's "maps a 401 with any code ... to genericRejection"
    // test. This test documents the UI-level behavior for this input and
    // guards the no-countdown invariant against this response specifically.
    const fetchMock = mockFetchSequence(
      new Response(
        JSON.stringify({
          error: { code: 'invalid_credentials', message: 'Adresse ou mot de passe incorrect.' },
        }),
        { status: 401 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByTestId('login-submit'))

    const errorNode = await screen.findByTestId('login-error')
    expect(errorNode).toHaveTextContent('Adresse ou mot de passe incorrect.')
    // no remaining-minutes countdown ever appears
    expect(errorNode.textContent).not.toMatch(/\d/)
  })

  it('shows the per-IP throttle copy, with no borrowed minutes countdown, on a 429 rate_limited response (FR7)', async () => {
    const fetchMock = mockFetchSequence(
      new Response(
        JSON.stringify({
          error: {
            code: 'rate_limited',
            message: 'Too many attempts from this connection. Try again later.',
          },
        }),
        { status: 429 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'anything')
    await user.click(screen.getByTestId('login-submit'))

    const errorNode = await screen.findByTestId('login-error')
    expect(errorNode).toHaveTextContent(
      'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
    )
    expect(errorNode.textContent).not.toMatch(/\d/)
  })

  it('shows the service-unavailable copy on a 503 (DB outage) response (FR7)', async () => {
    // Review gate round 1 (A2): the backend's 503 body message happens to
    // equal the mapped copy today, so asserting against that exact body
    // can't tell a real mapping from a verbatim err.message passthrough —
    // use a deliberately different body message so the assertion only
    // passes if the UI actually goes through the outcome mapping.
    const fetchMock = mockFetchSequence(
      new Response(
        JSON.stringify({
          error: {
            code: 'service_unavailable',
            message: 'Database connection pool exhausted',
          },
        }),
        { status: 503 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'anything')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Le service est momentanément indisponible. Réessayez dans un instant.',
    )
  })

  it('announces errors via aria-live for keyboard/screen-reader users (NFR5)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await user.click(screen.getByTestId('login-submit'))

    const emailError = await screen.findByTestId('login-email-error')
    expect(emailError).toHaveAttribute('aria-live', 'assertive')
    expect(emailError).toHaveAttribute('role', 'alert')
  })

  it('trims surrounding whitespace from the email before it reaches the request body (FR5)', async () => {
    const fetchMock = mockFetchSequence(
      new Response(
        JSON.stringify({
          token: 't',
          expiresAt: '2026-10-16T00:00:00Z',
          account: {
            userId: 1,
            clientId: null,
            mail: 'demo@cpal.test',
            nom: 'Demo',
            prenom: 'User',
            role: 'client',
            mustChangePassword: false,
          },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // userEvent.type with {skipClick:false} + a spaces-padded value defeats
    // the browser's own type="email" value trimming, so this exercises
    // setValueAs specifically rather than relying on input sanitization.
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement
    await user.click(emailInput)
    await user.paste('  demo@cpal.test  ')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'demo@cpal.test',
      password: 'correct-horse',
    })
  })

  it('reaches a settled, anonymous auth status (not a stuck spinner) when a slow bootstrap resolves after a failed login', async () => {
    let resolveBootstrap: (value: Response) => void = () => {}
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
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
      return new Promise<Response>((resolve) => {
        resolveBootstrap = resolve
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin({ withStatusProbe: true })

    // submit login before the bootstrap /account.php call has resolved
    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByTestId('login-submit'))

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Adresse ou mot de passe incorrect.',
    )
    // the failed login must settle status itself — not leave it on
    // 'loading' waiting for the (now-stale) bootstrap call to resolve
    await waitFor(() =>
      expect(screen.getByTestId('auth-status')).toHaveTextContent('anonymous'),
    )

    // the stale bootstrap call finally resolves (also anonymous/401) —
    // it must not retroactively change the already-settled status
    resolveBootstrap(new Response(null, { status: 401 }))
    await waitFor(() =>
      expect(screen.getByTestId('login-submit')).not.toBeDisabled(),
    )
    expect(screen.getByTestId('auth-status')).toHaveTextContent('anonymous')
  })

  // The "overtaken successful login" half of B1 is covered directly against
  // AuthContext in src/auth/AuthContext.test.tsx — driving it through this
  // UI is not reliable, since the submit button is disabled (RHF
  // isSubmitting) for the whole lifetime of the first in-flight request,
  // so a second real submit can never land while the first is pending.

  it('disables the submit button while the request is in flight', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/login.php')) {
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
      }
      return Promise.resolve(new Response(null, { status: 401 }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderLogin()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Email'), 'demo@cpal.test')
    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByTestId('login-submit'))

    await waitFor(() => expect(screen.getByTestId('login-submit')).toBeDisabled())

    resolveFetch(
      new Response(
        JSON.stringify({
          token: 't',
          expiresAt: '2026-10-16T00:00:00Z',
          account: {
            userId: 1,
            clientId: null,
            mail: 'demo@cpal.test',
            nom: 'Demo',
            prenom: 'User',
            role: 'client',
            mustChangePassword: false,
          },
        }),
        { status: 200 },
      ),
    )

    await waitFor(() =>
      expect(screen.getByTestId('home-screen')).toBeInTheDocument(),
    )
  })
})

describe('Login redirect targeting (FR2, FR3, FR14)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips the form and redirects home when the bootstrap already reports an authenticated session (FR2)', async () => {
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

    renderLogin()

    await waitFor(() =>
      expect(screen.getByTestId('home-screen')).toBeInTheDocument(),
    )
  })

  it('redirects to the validated suite target instead of home when one is present (FR2, FR3)', async () => {
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

    renderLogin({ initialEntry: '/login?suite=%2Fcontracts%2F42' })

    await waitFor(() =>
      expect(screen.getByTestId('suite-target-screen')).toBeInTheDocument(),
    )
  })

  it('ignores an open-redirect suite value and falls back to home (FR3)', async () => {
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

    renderLogin({
      initialEntry:
        '/login?suite=' + encodeURIComponent('https://evil.example.com'),
    })

    await waitFor(() =>
      expect(screen.getByTestId('home-screen')).toBeInTheDocument(),
    )
  })

  it('ignores a protocol-relative open-redirect suite value and falls back to home (FR3, review gate KAN-149 round 1)', async () => {
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

    renderLogin({
      initialEntry: '/login?suite=' + encodeURIComponent('//evil.example.com/phish'),
    })

    await waitFor(() =>
      expect(screen.getByTestId('home-screen')).toBeInTheDocument(),
    )
  })

  it('redirects a mustChangePassword account to the password-change route instead of home/suite (FR14)', async () => {
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
              mustChangePassword: true,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    renderLogin({ initialEntry: '/login?suite=%2Fcontracts%2F42' })

    await waitFor(() =>
      expect(screen.getByTestId('change-password-screen')).toBeInTheDocument(),
    )
  })
})

/**
 * KAN-156 — FR10 ("logged out" indicator) and FR11 (session-expired copy,
 * reused from authOutcome.ts's sessionExpired message).
 */
describe('Login notice indicator (FR10, FR11)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the logged-out indicator when redirected with ?notice=logged-out (FR10)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    renderLogin({ initialEntry: '/login?notice=logged-out' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('login-notice')).toHaveTextContent(
      'Vous avez été déconnecté(e).',
    )
  })

  it('shows the authOutcome.ts sessionExpired copy when redirected with ?notice=session-expired (FR11)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    renderLogin({ initialEntry: '/login?suite=%2Fcontracts%2F42&notice=session-expired' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('login-notice')).toHaveTextContent(
      'Votre session a expiré. Rechargez la page et réessayez.',
    )
  })

  it('renders no notice banner for an unrecognized or absent ?notice= value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    renderLogin({ initialEntry: '/login?notice=not-a-real-value' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('login-notice')).not.toBeInTheDocument()

    renderLogin({ initialEntry: '/login' })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.queryAllByTestId('login-notice')).toHaveLength(0)
  })
})
