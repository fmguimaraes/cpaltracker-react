import { render, screen, waitFor, within } from '@testing-library/react'
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
    /** When given, the logo response is held until this promise resolves (deterministic "loading" window). */
    logoGate?: Promise<void>
    role?: string
    clientId?: number | null
    mobile?: boolean
    logout?: () => Promise<Response>
  } = {},
) {
  const {
    logoStatus = 200,
    logoGate,
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
        const response = () => new Response(new Blob(['fake-png']), { status: logoStatus })
        return logoGate ? logoGate.then(response) : Promise.resolve(response())
      }
      return Promise.resolve(new Response('{}', { status: 404 }))
    }),
  )
}

function renderShell(opts: Parameters<typeof stubEnv>[0] & { path?: string } = {}) {
  stubEnv(opts)
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[opts.path ?? '/live-tracking']}>
          <AuthProvider>
            <Routes>
              <Route element={<AppShellLayout />}>
                <Route
                  path="/live-tracking"
                  element={<div data-testid="page-content">page content</div>}
                />
                <Route path="/pilotage" element={<div data-testid="page-content">pilotage</div>} />
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

  it('renders sidebar, brand mark, the nav links (Pulse, Tendances, Pilotage), and the routed page', async () => {
    renderShell()
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('cpal-brand-mark')).toBeInTheDocument()
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
    // No "Accueil" item: "/" redirects to Pulse, the landing page
    expect(screen.queryByTestId('nav-home')).not.toBeInTheDocument()
    // Suivi en direct and Historique are no longer in the menu (owner 2026-11-25); their routes remain.
    expect(screen.queryByTestId('nav-live-tracking')).not.toBeInTheDocument()
    expect(screen.queryByTestId('nav-history')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-pilotage')).toHaveTextContent('Pilotage')
    expect(screen.getByTestId('nav-trends')).toHaveTextContent('Tendances')
    expect(screen.getByTestId('nav-pulse')).toHaveTextContent('Pulse')
    expect(screen.getByTestId('page-content')).toHaveTextContent('page content')
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it("renders the client's own logo in the branding slot", async () => {
    renderShell()
    await waitFor(() =>
      expect(screen.getByTestId('client-logo')).toBeInTheDocument(),
    )
  })

  it('the theme is neither in the top bar nor in the user menu (it lives on the account page)', async () => {
    const user = userEvent.setup()
    renderShell()
    expect(within(await screen.findByTestId('shell-toolbar')).queryByTestId('theme-toggle')).not.toBeInTheDocument()
    await user.click(await screen.findByTestId('user-menu'))
    // Name, then the role.
    // The name arrives with the account, which can land after the menu opens: wait for the text, not the node.
    await waitFor(() => expect(screen.getByTestId('user-menu-identity')).toHaveTextContent(/Demo.*Client$/))
    expect(screen.queryByTestId('theme-choice')).not.toBeInTheDocument()
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

  it('shows a Skeleton while the client logo loads, then nothing when there is no logo', async () => {
    // The logo response is held on a gate: with an immediately-resolving stub the skeleton could be
    // mounted and removed between two polls of findBy*, which made this test flaky.
    let releaseLogo!: () => void
    const logoGate = new Promise<void>((resolve) => {
      releaseLogo = resolve
    })
    renderShell({ logoStatus: 404, logoGate })
    expect(await screen.findByTestId('client-logo-skeleton')).toBeInTheDocument()

    releaseLogo()
    await waitFor(() =>
      expect(screen.queryByTestId('client-logo-skeleton')).toBeNull(),
    )
    expect(screen.queryByTestId('client-logo')).toBeNull()
    expect(screen.queryByTestId('client-logo-placeholder')).toBeNull()
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
    expect(screen.queryByTestId('nav-pulse')).toBeNull()
  })
  it('nav: rail by default on a map page, expanded elsewhere; ☰ toggles it and the choice is remembered', async () => {
    const user = userEvent.setup()
    const { unmount } = renderShell({ path: '/live-tracking' })
    const sidebarState = () => document.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute('data-state')
    const toggle = screen.getByTestId('nav-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(sidebarState()).toBe('collapsed')
    // The avatar menu stays reachable in the rail, at the bottom.
    expect(screen.getByTestId('user-menu')).toBeInTheDocument()

    await user.click(toggle)
    expect(screen.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'true')
    expect(sidebarState()).toBe('expanded')
    expect(localStorage.getItem('cpal.shell.nav')).toBe('expanded')
    unmount()

    // The choice now overrides the map page default…
    renderShell({ path: '/live-tracking' })
    expect(screen.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'true')
  })

  it('nav: a non-map page opens expanded; folding it to the rail is remembered', async () => {
    const user = userEvent.setup()
    const { unmount } = renderShell({ path: '/pilotage' })
    expect(screen.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByTestId('nav-toggle'))
    expect(localStorage.getItem('cpal.shell.nav')).toBe('rail')
    unmount()
    renderShell({ path: '/pilotage' })
    expect(screen.getByTestId('nav-toggle')).toHaveAttribute('aria-expanded', 'false')
  })
})
