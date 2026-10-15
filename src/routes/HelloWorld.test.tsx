import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { HelloWorld } from './HelloWorld'

function renderHelloWorld() {
  return render(
    <AuthProvider>
      <HelloWorld />
    </AuthProvider>,
  )
}

describe('HelloWorld', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    window.localStorage.clear()
  })

  it('renders a connected state once the anonymous /api/v1 request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'unauthenticated' }), {
          status: 401,
        }),
      ),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent(
        'not signed in',
      ),
    )
  })

  it('renders an authenticated account when /api/v1/account.php succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            account: {
              id: '1',
              email: 'demo@cpal.test',
              mustChangePassword: false,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    renderHelloWorld()

    await waitFor(() =>
      expect(screen.getByTestId('connected')).toHaveTextContent(
        'demo@cpal.test',
      ),
    )
  })

  it('toggles the theme on click and persists it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    )
    const user = userEvent.setup()
    renderHelloWorld()

    const toggle = screen.getByTestId('theme-toggle')
    expect(toggle).toHaveTextContent('Switch to dark')

    await user.click(toggle)

    expect(toggle).toHaveTextContent('Switch to light')
    expect(window.localStorage.getItem('cpaltracker:theme')).toBe('dark')
  })
})
