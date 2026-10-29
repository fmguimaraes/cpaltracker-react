import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/theme'
import { TooltipProvider } from '@/ui/tooltip'
import { AuthProvider } from '../auth/AuthContext'
import { AccountLayout } from './AccountLayout'
import { RequireAuth } from './RequireAuth'

const account = {
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

function renderAt(search: string, mustChangePassword: boolean) {
  vi.stubGlobal('innerWidth', 1440)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ account: { ...account, mustChangePassword } }), { status: 200 }),
      ),
    ),
  )
  return render(
    <ThemeProvider>
      <TooltipProvider>
        <MemoryRouter initialEntries={[`/change-password${search}`]}>
          <AuthProvider>
            <Routes>
              <Route
                path="/change-password"
                element={
                  <RequireAuth allowMustChangePassword>
                    <AccountLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<div data-testid="page-content">account page</div>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </TooltipProvider>
    </ThemeProvider>,
  )
}

describe('AccountLayout (FR12, F-41)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('wraps the account page in the shell in normal mode', async () => {
    renderAt('', false)
    expect(await screen.findByTestId('page-content')).toBeInTheDocument()
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('stays shell-less in first-connection mode (mustChangePassword)', async () => {
    renderAt('', true)
    expect(await screen.findByTestId('page-content')).toBeInTheDocument()
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
  })

  it('stays shell-less in first-connection mode (?premiere)', async () => {
    renderAt('?premiere', false)
    expect(await screen.findByTestId('page-content')).toBeInTheDocument()
    expect(screen.queryByTestId('app-sidebar')).toBeNull()
  })
})
