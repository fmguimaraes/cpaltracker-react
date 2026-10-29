import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/theme'
import { TooltipProvider } from '@/ui/tooltip'
import { AuthProvider } from '../auth/AuthContext'
import { AppShellLayout } from './AppShellLayout'

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

function stubEnv(
  opts: {
    logoStatus?: number
    role?: string
    clientId?: number | null
    mobile?: boolean
    logout?: () => Promise<Response>
  } = {},
) {
  const {
    logoStatus = 200,
    role = 'client',
    clientId = 7,
    mobile = false,
    logout = () => Promise.resolve(new Response(null, { status: 204 })),
  } = opts
  vi.stubGlobal('innerWidth', mobile ? 390 : 1440)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: mobile,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/auth/logout.php')) return logout()
      if (url.includes('/account.php')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ account: { ...account, role, clientId } }),
            { status: 200 },
          ),
        )
      }
      if (url.includes('/clients/logo.php')) {
        return Promise.resolve(
          new Response(new Blob(['fake-png']), { status: logoStatus }),
        )
      }
      return Promise.resolve(new Response('{}', { status: 404 }))
    }),
  )
}

function renderShell(opts: Parameters<typeof stubEnv>[0] = {}) {
  stubEnv(opts)
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/live-tracking']}>
          <AuthProvider>
            <Routes>
              <Route element={<AppShellLayout />}>
                <Route
                  path="/live-tracking"
                  element={<div data-testid="page-content">page content</div>}
                />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

describe('AppShellLayout (KAN-224 FR6)', () => {
  beforeEach(() => {
    localStorage.clear()
    URL.createObjectURL = vi.fn(() => 'blob:mock-logo-url')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders sidebar, brand mark, the four nav links with the existing labels, and the routed page', async () => {
    renderShell()
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('cpal-brand-mark')).toBeInTheDocument()
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
    expect(screen.getByTestId('nav-home')).toHaveTextContent('Accueil')
    expect(screen.getByTestId('nav-live-tracking')).toHaveTextContent(
      'Suivi en direct',
    )
    expect(screen.getByTestId('nav-history')).toHaveTextContent('Historique')
    expect(screen.getByTestId('nav-pilotage')).toHaveTextContent('Pilotage')
    expect(screen.getByTestId('nav-live-tracking')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByTestId('page-content')).toHaveTextContent('page content')
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it("renders the client's own logo in the branding slot", async () => {
    renderShell()
    await waitFor(() =>
      expect(screen.getByTestId('client-logo')).toBeInTheDocument(),
    )
  })

  it('flips the theme in a single click and offers the system choice', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.click(screen.getByTestId('theme-toggle'))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(screen.getByTestId('theme-system')).toBeInTheDocument()
  })

  it('exposes sign out (logout-button) in the user menu', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(await screen.findByTestId('user-menu'))
    expect(await screen.findByTestId('logout-button')).toBeInTheDocument()
  })

  it('sign out issues one explicit POST (KAN-156 FR10, moved from the home page)', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(await screen.findByTestId('user-menu'))
    await user.click(await screen.findByTestId('logout-button'))
    const fetchMock = vi.mocked(fetch)
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/auth/logout.php'))).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes('/auth/logout.php'))!
    expect((call[1] as RequestInit).method).toBe('POST')
  })

  it('sign out is disabled while in flight, so a second click sends no second POST (KAN-156 review round 2)', async () => {
    const user = userEvent.setup()
    // The POST never settles, so the entry stays pending.
    renderShell({ logout: () => new Promise<Response>(() => undefined) })
    await user.click(await screen.findByTestId('user-menu'))
    await user.click(await screen.findByTestId('logout-button'))
    await user.click(await screen.findByTestId('user-menu'))
    const item = await screen.findByTestId('logout-button')
    expect(item).toHaveAttribute('data-disabled')
    await user.click(item)
    const logoutCalls = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes('/auth/logout.php'))
    expect(logoutCalls).toHaveLength(1)
  })

  it('shows a Skeleton while the client logo loads, then a tokenised placeholder on failure', async () => {
    renderShell({ logoStatus: 404 })
    expect(
      await screen.findByTestId('client-logo-skeleton'),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('client-logo-placeholder')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('client-logo-skeleton')).toBeNull()
    expect(screen.getByTestId('client-logo-placeholder')).not.toHaveAttribute(
      'style',
    )
  })

  it('hides the client logo slot for an admin', async () => {
    renderShell({ role: 'admin', clientId: null })
    await screen.findByTestId('user-menu')
    expect(screen.queryByTestId('client-logo-skeleton')).toBeNull()
    expect(screen.queryByTestId('client-logo')).toBeNull()
    expect(screen.queryByTestId('client-logo-placeholder')).toBeNull()
  })

  it('below 768 px renders the brand mark once, outside the closed drawer', async () => {
    renderShell({ mobile: true })
    expect(await screen.findAllByTestId('cpal-brand-mark')).toHaveLength(1)
    expect(screen.queryByTestId('nav-history')).toBeNull()
  })
})
