import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@/app/theme'
import { CpalBrandMark } from './CpalBrandMark'

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
}

describe('CpalBrandMark (KAN-171 FR8, KAN-224 FR6)', () => {
  beforeEach(() => {
    stubMatchMedia()
    localStorage.clear()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the orange variant on dark with the responsive size (CB17)', () => {
    localStorage.setItem('cpaltracker:theme', 'dark')
    render(
      <ThemeProvider>
        <CpalBrandMark />
      </ThemeProvider>,
    )
    const img = screen.getByTestId('cpal-brand-mark')
    expect(img).toHaveAttribute('src', '/logo-cpal-orange.png')
    expect(img).toHaveAttribute('alt', 'c-PAL')
    expect(img.className).toContain('h-12')
    expect(img.className).toContain('max-md:h-10')
    expect(img.className).toContain('w-auto')
  })

  it('renders the dark variant on light', () => {
    localStorage.setItem('cpaltracker:theme', 'light')
    render(
      <ThemeProvider>
        <CpalBrandMark />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('cpal-brand-mark')).toHaveAttribute('src', '/logo-cpal-dark.png')
  })
})
