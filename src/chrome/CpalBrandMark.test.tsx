import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CpalBrandMark } from './CpalBrandMark'

describe('CpalBrandMark (KAN-171 FR8)', () => {
  it('renders the c-PAL brand asset with a responsive, token-driven size (CB17)', () => {
    render(<CpalBrandMark />)

    const img = screen.getByTestId('cpal-brand-mark')
    expect(img).toHaveAttribute('src', '/logo-cpal.png')
    expect(img).toHaveAttribute('alt', 'c-PAL')
    // h-12/max-md:h-10 replicate CB17's 48px base / 40px reduced size via
    // the reconciled `max-md` breakpoint (FR7) rather than a literal
    // `@media` rule.
    expect(img.className).toContain('h-12')
    expect(img.className).toContain('max-md:h-10')
    expect(img.className).toContain('w-auto')
  })
})
