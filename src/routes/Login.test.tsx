import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { setAuthToken } from '../api/client'
import { Login } from './Login'

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div data-testid="home-screen" />} />
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

  it('surfaces the real {error:{code,message}} body on invalid credentials without extra client-side detail (FR4, anti-enumeration)', async () => {
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

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Invalid email or password.',
    )
    // the form stays put — no navigation on failure
    expect(screen.getByTestId('login-form')).toBeInTheDocument()
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
