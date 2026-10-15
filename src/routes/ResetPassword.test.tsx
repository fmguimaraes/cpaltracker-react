import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResetPassword } from './ResetPassword'

function renderResetPassword(search = '?t=valid-token') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div data-testid="login-screen" />} />
        <Route path="/forgot-password" element={<div data-testid="forgot-password-screen" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResetPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.querySelectorAll('meta[name="referrer"]').forEach((el) => el.remove())
  })

  it('renders a labeled, keyboard-accessible password + confirmation form and never shows the token as text (FR4, FR5)', () => {
    renderResetPassword('?t=super-secret-token')

    expect(screen.getByLabelText('Nouveau mot de passe')).toBeVisible()
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Confirmer le mot de passe')).toBeVisible()
    expect(screen.getByTestId('reset-password-submit')).toBeVisible()
    expect(document.body.textContent).not.toContain('super-secret-token')
  })

  it('installs a no-referrer meta tag for the lifetime of the screen only (NFR4)', () => {
    const { unmount } = renderResetPassword()

    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    )

    unmount()
    expect(document.querySelector('meta[name="referrer"]')).toBeNull()
  })

  it('shows a terminal "missing link" state and never renders the form when the t param is absent (FR7)', async () => {
    renderResetPassword('')

    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('reset-password-token-problem')).toHaveTextContent(
        'Lien incomplet. Reprenez le message reçu par e-mail.',
      ),
    )
    expect(screen.getByTestId('reset-password-request-new-link')).toBeVisible()
  })

  it('keeps submit disabled until both fields are filled and match (FR5)', async () => {
    const user = userEvent.setup()
    renderResetPassword()

    const submit = screen.getByTestId('reset-password-submit')
    expect(submit).toBeDisabled()

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await waitFor(() => expect(submit).toBeDisabled())

    await user.type(screen.getByTestId('reset-password-confirmation'), 'ne-correspond-pas')
    await waitFor(() => expect(submit).toBeDisabled())
    expect(screen.getByTestId('reset-password-confirmation-error')).toHaveTextContent(
      'Les deux saisies diffèrent.',
    )

    await user.clear(screen.getByTestId('reset-password-confirmation'))
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await waitFor(() => expect(submit).toBeEnabled())
  })

  it('re-validates the confirmation field when the password changes after it (FR5)', async () => {
    const user = userEvent.setup()
    renderResetPassword()

    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await waitFor(() =>
      expect(screen.getByTestId('reset-password-submit')).toBeEnabled(),
    )

    await user.clear(screen.getByTestId('reset-password-password'))
    await user.type(screen.getByTestId('reset-password-password'), 'une-autre-phrase-2')
    await waitFor(() =>
      expect(screen.getByTestId('reset-password-confirmation-error')).toHaveTextContent(
        'Les deux saisies diffèrent.',
      ),
    )
  })

  it('submits token + password through apiClient and shows the success confirmation (FR5, FR8)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Password has been reset.' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderResetPassword('?t=valid-token')

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('reset-password-success')).toHaveTextContent(
        'Votre mot de passe a été modifié. Toutes vos autres sessions ont été fermées',
      ),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/reset-password.php')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body as string)).toEqual({
      token: 'valid-token',
      password: 'une-phrase-correcte-1',
    })
    expect(screen.getByTestId('reset-password-login-link')).toBeVisible()
  })

  it.each([
    [
      'an expired token',
      'Ce lien n\'est plus valable. Demandez-en un nouveau.',
    ],
    [
      'an already-consumed token',
      'Ce lien vient d\'être utilisé. Demandez-en un nouveau.',
    ],
  ])('hides the form and renders the server\'s distinct message for %s (FR7)', async (_label, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'invalid_token', message } }),
          { status: 401 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderResetPassword()

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('reset-password-token-problem')).toHaveTextContent(message),
    )
    expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument()
  })

  it('hides the form and renders the shared ipThrottle message for a 429 (CB3), distinct from the invalid-token text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
          { status: 429 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderResetPassword()

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('reset-password-token-problem')).toHaveTextContent(
        'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
      ),
    )
  })

  it('keeps the form visible and shows the verbatim policy/HIBP rejection inline on a 400 weak_password (FR6)', async () => {
    const message =
      'Il faut au moins 12 caractères ; celui-ci en compte 5. Choisissez-en un autre.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'weak_password', message } }), {
          status: 400,
        }),
      ),
    )
    const user = userEvent.setup()
    renderResetPassword()

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('reset-password-form-error')).toHaveTextContent(message),
    )
    expect(screen.getByTestId('reset-password-form')).toBeVisible()
  })

  it('keeps the form visible and shows a recoverable error on a genuine 503 (transient, not a dead token)', async () => {
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
    renderResetPassword()

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('reset-password-form-error')).toHaveTextContent(
        'Le service est momentanément indisponible. Réessayez dans un instant.',
      ),
    )
    expect(screen.getByTestId('reset-password-form')).toBeVisible()
  })

  it('sends credentials: "omit" and no Authorization header (unauthenticated endpoint)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderResetPassword()

    await user.type(screen.getByTestId('reset-password-password'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('reset-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('reset-password-submit'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
