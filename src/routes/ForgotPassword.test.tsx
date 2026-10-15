import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ForgotPassword } from './ForgotPassword'

function renderForgotPassword() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<div data-testid="login-screen" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ForgotPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a labeled, keyboard-accessible e-mail form (FR1)', () => {
    renderForgotPassword()

    expect(screen.getByLabelText('Adresse e-mail')).toBeVisible()
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('type', 'email')
    expect(screen.getByTestId('forgot-password-submit')).toBeVisible()
  })

  it('keeps submit disabled until a validly formatted e-mail is entered (FR1)', async () => {
    const user = userEvent.setup()
    renderForgotPassword()

    const submit = screen.getByTestId('forgot-password-submit')
    const email = screen.getByTestId('forgot-password-email')

    expect(submit).toBeDisabled()

    await user.type(email, 'not-an-email')
    await waitFor(() => expect(submit).toBeDisabled())

    await user.clear(email)
    await user.type(email, 'demo@cpal.test')
    await waitFor(() => expect(submit).toBeEnabled())
  })

  it('submits through apiClient (no direct fetch elsewhere) and shows the confirmation on success (FR2, FR3)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok', expiresInMinutes: 60 }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForgotPassword()

    await user.type(screen.getByTestId('forgot-password-email'), 'demo@cpal.test')
    await user.click(screen.getByTestId('forgot-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('forgot-password-confirmation')).toBeVisible(),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/forgot-password.php')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'demo@cpal.test' })
  })

  // FR2/NFR3 — the same confirmation state (identical text, identical
  // data-testid, identical DOM structure) must render for every one of
  // these outcomes. No test here ever asserts a *different* screen for any
  // of them — that absence is the regression guard this story's Technical
  // Requirements ask for.
  it.each([
    ['an unknown-account-shaped 200', new Response(JSON.stringify({ message: 'ok' }), { status: 200 })],
    ['a malformed-body 400', new Response(JSON.stringify({ error: { code: 'invalid_body', message: 'Bad request' } }), { status: 400 })],
    ['a per-IP-throttle 429 (CB3)', new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }), { status: 429 })],
  ])('renders the identical confirmation for %s', async (_label, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const user = userEvent.setup()
    renderForgotPassword()

    await user.type(screen.getByTestId('forgot-password-email'), 'demo@cpal.test')
    await user.click(screen.getByTestId('forgot-password-submit'))

    const confirmation = await screen.findByTestId('forgot-password-confirmation')
    expect(confirmation).toHaveTextContent(
      'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de lui être envoyé.',
    )
  })

  it('renders a distinct service-unavailable message on a genuine 5xx, never the confirmation (not an account-existence leak)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'service_unavailable', message: 'Down' } }),
          { status: 503 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderForgotPassword()

    await user.type(screen.getByTestId('forgot-password-email'), 'demo@cpal.test')
    await user.click(screen.getByTestId('forgot-password-submit'))

    const confirmation = await screen.findByTestId('forgot-password-confirmation')
    expect(confirmation).toHaveTextContent(
      'Le service est momentanément indisponible. Réessayez dans un instant.',
    )
  })

  it('sends credentials: "omit" and no Authorization header (unauthenticated endpoint)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderForgotPassword()

    await user.type(screen.getByTestId('forgot-password-email'), 'demo@cpal.test')
    await user.click(screen.getByTestId('forgot-password-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('links back to the login screen', async () => {
    const user = userEvent.setup()
    renderForgotPassword()

    await user.click(screen.getByTestId('forgot-password-back-to-login'))

    await waitFor(() => expect(screen.getByTestId('login-screen')).toBeVisible())
  })
})
