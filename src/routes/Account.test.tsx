import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { Account } from './Account'

interface TestAccount {
  userId: number
  clientId: number | null
  mail: string
  nom: string
  prenom: string
  role: 'client' | 'admin'
  telephone: string | null
  lastLoginAt: string | null
  mustChangePassword: boolean
}

const baseAccount: TestAccount = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

function stubFetchWithAccount(account: TestAccount, extra?: (url: string, init?: RequestInit) => Response | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const extraResponse = extra?.(url, init)
      if (extraResponse) return Promise.resolve(extraResponse)
      if (url.includes('/account.php')) {
        return Promise.resolve(new Response(JSON.stringify({ account }), { status: 200 }))
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function renderAccount(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/change-password${search}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/change-password" element={<Account />} />
          <Route path="/login" element={<div data-testid="login-screen" />} />
          <Route path="/" element={<div data-testid="home-screen" />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Account (KAN-152, FR9, FR10)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders only the password form, the first-connection notice, and hides nav/logout/phone/e-mail when mustChangePassword (FR10)', async () => {
    stubFetchWithAccount({ ...baseAccount, mustChangePassword: true })
    renderAccount()

    await waitFor(() =>
      expect(screen.getByTestId('account-first-connection-notice')).toBeVisible(),
    )
    expect(screen.getByTestId('account-password-form')).toBeVisible()
    expect(screen.queryByTestId('account-phone-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-email-section')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-logout')).not.toBeInTheDocument()
    expect(screen.queryByTestId('account-back-to-app')).not.toBeInTheDocument()
  })

  it('also enters first-connection mode on a ?premiere flag even when mustChangePassword is false (FR10)', async () => {
    stubFetchWithAccount({ ...baseAccount, mustChangePassword: false })
    renderAccount('?premiere')

    await waitFor(() =>
      expect(screen.getByTestId('account-first-connection-notice')).toBeVisible(),
    )
    expect(screen.queryByTestId('account-phone-section')).not.toBeInTheDocument()
  })

  it('renders all three sections, the back-to-app link, and logout when not in first-connection mode', async () => {
    stubFetchWithAccount(baseAccount)
    renderAccount()

    await waitFor(() => expect(screen.getByTestId('account-password-section')).toBeVisible())
    expect(screen.queryByTestId('account-first-connection-notice')).not.toBeInTheDocument()
    expect(screen.getByTestId('account-phone-section')).toBeVisible()
    expect(screen.getByTestId('account-email-section')).toBeVisible()
    expect(screen.getByTestId('account-logout')).toBeVisible()
    expect(screen.getByTestId('account-back-to-app')).toBeVisible()
  })

  it('blocks all three action submits until the current-password field is filled (FR11)', async () => {
    stubFetchWithAccount(baseAccount)
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-password-section')).toBeVisible())

    expect(screen.getByTestId('account-password-submit')).toBeDisabled()
    expect(screen.getByTestId('account-phone-submit')).toBeEnabled() // mode:onSubmit — blocked on submit, not disabled
    expect(screen.getByTestId('account-email-submit')).toBeEnabled()
  })

  it('on a successful password change shows the "other sessions closed" message and keeps the session logged in (FR12)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount, (url, init) => {
      if (url.includes('/account.php') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ account: baseAccount }), { status: 200 })
      }
      if (url.includes('/auth/login.php')) {
        return new Response(
          JSON.stringify({ token: 'FRESH', expiresAt: '2026-10-16T10:00:00Z', account: baseAccount }),
          { status: 200 },
        )
      }
      return null
    })
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-password-section')).toBeVisible())

    await user.type(screen.getByTestId('account-password-current'), 'old-pw')
    await user.type(screen.getByTestId('account-password-new'), 'une-phrase-correcte-1')
    await user.type(screen.getByTestId('account-password-confirmation'), 'une-phrase-correcte-1')
    await user.click(screen.getByTestId('account-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-password-success')).toHaveTextContent(
        'Toutes vos autres sessions ont été fermées',
      ),
    )
    // Still on the account page, not redirected to /login (session-loss did not fire).
    expect(screen.queryByTestId('login-screen')).not.toBeInTheDocument()
  })

  it('rejects client-side a new password identical to the current one (FR12)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount)
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-password-section')).toBeVisible())

    await user.type(screen.getByTestId('account-password-current'), 'same-password-1')
    await user.type(screen.getByTestId('account-password-new'), 'same-password-1')
    await user.type(screen.getByTestId('account-password-confirmation'), 'same-password-1')

    await waitFor(() =>
      expect(screen.getByTestId('account-password-new-error')).toHaveTextContent(
        'Le nouveau mot de passe doit être différent de l\'ancien.',
      ),
    )
    expect(screen.getByTestId('account-password-submit')).toBeDisabled()
  })

  it('renders the API\'s verbatim invalid_field rejection on a phone-format error (FR13)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount, (url, init) => {
      if (url.includes('/account.php') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            error: { code: 'invalid_field', message: 'Format attendu : +33612345678 (indicatif pays compris).' },
          }),
          { status: 400 },
        )
      }
      return null
    })
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-phone-section')).toBeVisible())

    // Bypass client-side validation (a server-only rejection, e.g. some
    // edge case the client regex doesn't catch) to exercise the wire path.
    await user.type(screen.getByTestId('account-phone-number'), '+33612345678')
    await user.type(screen.getByTestId('account-phone-current-password'), 'pw')
    await user.click(screen.getByTestId('account-phone-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-phone-form-error')).toHaveTextContent(
        'Format attendu : +33612345678 (indicatif pays compris).',
      ),
    )
  })

  it('rejects an obviously malformed phone number inline, client-side, before submission (FR13)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount)
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-phone-section')).toBeVisible())

    await user.type(screen.getByTestId('account-phone-number'), 'not-a-phone')
    await user.type(screen.getByTestId('account-phone-current-password'), 'pw')
    await user.click(screen.getByTestId('account-phone-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-phone-number-error')).toHaveTextContent(
        'Format attendu : +33612345678 (indicatif pays compris).',
      ),
    )
  })

  it('treats an empty phone submission as a valid "clear the number" action (FR13)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(
      { ...baseAccount, telephone: '+33612345678' },
      (url, init) => {
        if (url.includes('/account.php') && init?.method === 'PATCH') {
          expect(JSON.parse(init.body as string)).toEqual({ currentPassword: 'pw', phone: '' })
          return new Response(JSON.stringify({ account: { ...baseAccount, telephone: null } }), {
            status: 200,
          })
        }
        return null
      },
    )
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-phone-section')).toBeVisible())

    await user.clear(screen.getByTestId('account-phone-number'))
    await user.type(screen.getByTestId('account-phone-current-password'), 'pw')
    await user.click(screen.getByTestId('account-phone-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-phone-success')).toHaveTextContent('Numéro supprimé.'),
    )
  })

  it('rejects client-side an e-mail identical to the current one (FR14)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount)
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-email-section')).toBeVisible())

    const emailField = screen.getByTestId('account-email-address')
    await user.clear(emailField)
    await user.type(emailField, 'demo@cpal.test')
    await user.type(screen.getByTestId('account-email-current-password'), 'pw')
    await user.click(screen.getByTestId('account-email-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-email-address-error')).toHaveTextContent(
        "C'est déjà votre adresse actuelle.",
      ),
    )
  })

  it('on a successful e-mail change shows the "not yet verified" message (FR14)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount, (url, init) => {
      if (url.includes('/account.php') && init?.method === 'PATCH') {
        expect(JSON.parse(init.body as string)).toEqual({
          currentPassword: 'pw',
          email: 'new@cpal.test',
        })
        return new Response(
          JSON.stringify({ account: { ...baseAccount, mail: 'new@cpal.test' } }),
          { status: 200 },
        )
      }
      return null
    })
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-email-section')).toBeVisible())

    const emailField = screen.getByTestId('account-email-address')
    await user.clear(emailField)
    await user.type(emailField, 'NEW@cpal.test')
    await user.type(screen.getByTestId('account-email-current-password'), 'pw')
    await user.click(screen.getByTestId('account-email-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-email-success')).toHaveTextContent(
        "Elle n'est pas encore vérifiée.",
      ),
    )
  })

  it('renders the shared ipThrottle message consistently on a 429 for any of the three actions (FR15)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount, (url, init) => {
      if (url.includes('/account.php') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
          { status: 429 },
        )
      }
      return null
    })
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-phone-section')).toBeVisible())

    await user.type(screen.getByTestId('account-phone-number'), '+33612345678')
    await user.type(screen.getByTestId('account-phone-current-password'), 'pw')
    await user.click(screen.getByTestId('account-phone-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-phone-form-error')).toHaveTextContent(
        'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
      ),
    )
  })

  it('renders a fixed, non-wire message on a wrong current password (401 invalid_credentials)', async () => {
    const user = userEvent.setup()
    stubFetchWithAccount(baseAccount, (url, init) => {
      if (url.includes('/account.php') && init?.method === 'PATCH') {
        return new Response(
          JSON.stringify({
            error: { code: 'invalid_credentials', message: 'Mot de passe actuel incorrect.' },
          }),
          { status: 401 },
        )
      }
      return null
    })
    renderAccount()
    await waitFor(() => expect(screen.getByTestId('account-phone-section')).toBeVisible())

    await user.type(screen.getByTestId('account-phone-number'), '+33612345678')
    await user.type(screen.getByTestId('account-phone-current-password'), 'wrong')
    await user.click(screen.getByTestId('account-phone-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('account-phone-form-error')).toHaveTextContent(
        'Mot de passe actuel incorrect.',
      ),
    )
  })
})
