import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from '@/app/theme'
import { Button } from '@/ui/button'

/**
 * KAN-223 (FR4) — the app's theme provider (copied from the UI reference): light | dark |
 * system, dark by default (D7), stored under the same key the former themeStore used.
 */
type Listener = () => void

let prefersLight = false
let listeners: Listener[] = []

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      get matches() {
        return prefersLight
      },
      addEventListener: (_: string, listener: Listener) => listeners.push(listener),
      removeEventListener: (_: string, listener: Listener) => {
        listeners = listeners.filter((l) => l !== listener)
      },
    })),
  )
}

function Probe() {
  const { theme, resolved, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="choice">{theme}</span>
      <span data-testid="resolved">{resolved}</span>
      <Button type="button" onClick={() => setTheme('light')}>
        light
      </Button>
      <Button type="button" onClick={() => setTheme('system')}>
        system
      </Button>
    </div>
  )
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

describe('ThemeProvider (KAN-223 FR4)', () => {
  beforeEach(() => {
    prefersLight = false
    listeners = []
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    stubMatchMedia()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to dark and writes it to <html data-theme> (D7)', () => {
    renderProbe()
    expect(screen.getByTestId('choice')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('restores the choice stored under cpaltracker:theme', () => {
    window.localStorage.setItem('cpaltracker:theme', 'light')
    renderProbe()
    expect(screen.getByTestId('resolved')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('ignores an unknown stored value and falls back to dark', () => {
    window.localStorage.setItem('cpaltracker:theme', 'sepia')
    renderProbe()
    expect(screen.getByTestId('choice')).toHaveTextContent('dark')
  })

  it('persists an explicit choice under the same storage key', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByRole('button', { name: 'light' }))
    expect(window.localStorage.getItem('cpaltracker:theme')).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('"system" follows prefers-color-scheme, including later changes', async () => {
    const user = userEvent.setup()
    renderProbe()
    await user.click(screen.getByRole('button', { name: 'system' }))
    expect(screen.getByTestId('choice')).toHaveTextContent('system')
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark')

    prefersLight = true
    act(() => listeners.forEach((listener) => listener()))
    expect(screen.getByTestId('resolved')).toHaveTextContent('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('throws when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useTheme must be used inside ThemeProvider')
  })
})
