import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ClientLogo } from './ClientLogo'

const clientAccount = {
  userId: 1,
  clientId: 7,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

function stubFetch(logoHandler: (url: string) => Response, account: Record<string, unknown> = clientAccount) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/account.php')) {
        return Promise.resolve(new Response(JSON.stringify({ account }), { status: 200 }))
      }
      return Promise.resolve(logoHandler(url))
    }),
  )
}

function renderClientLogo() {
  return render(
    <AuthProvider>
      <ClientLogo />
    </AuthProvider>,
  )
}

describe('ClientLogo (KAN-161 FR1-FR4, NFR6, NFR7)', () => {
  beforeEach(() => {
    // jsdom doesn't implement these at all (not even as a stub), so there is
    // nothing to vi.spyOn() yet — they're assigned directly instead.
    URL.createObjectURL = vi.fn(() => 'blob:mock-logo-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the logo from the single unified endpoint, scoped to the account\'s own clientId (FR1, NFR3)', async () => {
    let requestedUrl: string | null = null
    let callCount = 0
    const logoFetch = vi.fn((url: string) => {
      requestedUrl = url
      callCount += 1
      return new Response(new Blob(['fake-png']), { status: 200 })
    })
    stubFetch(logoFetch)

    renderClientLogo()

    await waitFor(() => expect(screen.getByTestId('client-logo')).toHaveAttribute('src', 'blob:mock-logo-url'))
    expect(callCount).toBe(1)
    expect(requestedUrl).toContain('/clients/logo.php/7')
  })

  it('renders a neutral placeholder, not nothing and not an error message, on the unified 404 (FR3, NFR7)', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { code: 'not_found', message: 'No logo found for this client.' } }), { status: 404 }))

    renderClientLogo()

    await waitFor(() => expect(screen.getByTestId('client-logo-placeholder')).toBeInTheDocument())
    expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument()
    expect(screen.getByTestId('client-logo-placeholder')).toHaveTextContent('')
  })

  it('renders the exact same placeholder markup on a forbidden (403) response as on the 404 case (FR3, NFR7)', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { code: 'must_change_password', message: 'nope' } }), { status: 403 }))

    renderClientLogo()

    await waitFor(() => expect(screen.getByTestId('client-logo-placeholder')).toBeInTheDocument())
    expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument()
  })

  it('renders the same placeholder on a network/service error, never distinguishing the failure cause (FR3, NFR7)', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'down' } }), { status: 503 }))

    renderClientLogo()

    await waitFor(() => expect(screen.getByTestId('client-logo-placeholder')).toBeInTheDocument())
  })

  it('never requests or renders a logo for an admin account (FR2)', async () => {
    const logoFetch = vi.fn(() => new Response(new Blob(['fake-png']), { status: 200 }))
    stubFetch(logoFetch, { ...clientAccount, role: 'admin', clientId: null })

    renderClientLogo()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument()
    expect(screen.queryByTestId('client-logo-placeholder')).not.toBeInTheDocument()
    expect(logoFetch).not.toHaveBeenCalled()
  })

  it('never requests or renders a logo for a client-role account with no ClientID (FR2)', async () => {
    const logoFetch = vi.fn(() => new Response(new Blob(['fake-png']), { status: 200 }))
    stubFetch(logoFetch, { ...clientAccount, clientId: null })

    renderClientLogo()

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument()
    expect(screen.queryByTestId('client-logo-placeholder')).not.toBeInTheDocument()
    expect(logoFetch).not.toHaveBeenCalled()
  })

  it('caps the rendered logo at 220x80 with object-fit: contain via tokens (FR4)', async () => {
    stubFetch(() => new Response(new Blob(['fake-png']), { status: 200 }))

    renderClientLogo()

    const img = await screen.findByTestId('client-logo')
    expect(img.className).toContain('max-h-20')
    expect(img.className).toContain('max-w-[220px]')
    expect(img.className).toContain('object-contain')
  })
})
