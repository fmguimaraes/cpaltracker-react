import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { AppChrome } from './AppChrome'

const account = {
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

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/account.php')) {
        return Promise.resolve(new Response(JSON.stringify({ account }), { status: 200 }))
      }
      if (url.includes('/clients/logo.php')) {
        return Promise.resolve(new Response(new Blob(['fake-png']), { status: 200 }))
      }
      return Promise.resolve(new Response('{}', { status: 404 }))
    }),
  )
}

function renderChrome() {
  return render(
    <MemoryRouter initialEntries={['/live-tracking']}>
      <AuthProvider>
        <AppChrome>
          <div data-testid="page-content">page content</div>
        </AppChrome>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AppChrome (KAN-171 FR1, FR8, FR9)', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-logo-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the sidebar with the c-PAL brand mark, primary navigation, and the wrapped page content', async () => {
    stubFetch()

    renderChrome()

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('cpal-brand-mark')).toBeInTheDocument()
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
    expect(screen.getByTestId('nav-live-tracking')).toBeInTheDocument()
    expect(screen.getByTestId('page-content')).toHaveTextContent('page content')
  })

  it("renders the signed-in client's own logo once, in the chrome's branding slot (FR1)", async () => {
    stubFetch()

    renderChrome()

    await waitFor(() => expect(screen.getByTestId('client-logo')).toBeInTheDocument())
  })
})
