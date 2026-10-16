import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageTitle } from './PageTitle'

describe('PageTitle (KAN-171 FR9, FR10)', () => {
  it('renders an h1 whose color is the primary token and whose size is token-driven and responsive', () => {
    render(<PageTitle data-testid="page-title">c-PAL Assets Tracking</PageTitle>)

    const heading = screen.getByTestId('page-title')
    expect(heading.tagName).toBe('H1')
    expect(heading).toHaveTextContent('c-PAL Assets Tracking')
    // FR9: color comes from the primary token (CB18), not a hardcoded value.
    expect(heading).toHaveStyle({ color: 'var(--color-primary)' })
    // FR10: the typography-scale tokens (`--font-size-xl`/`--font-size-lg`)
    // are consumed, not Tailwind's own built-in `text-xl` scale, and the
    // size shrinks at the reconciled `max-md` breakpoint (FR7/CB18).
    expect(heading.className).toContain('text-[length:var(--font-size-xl)]')
    expect(heading.className).toContain('max-md:text-[length:var(--font-size-lg)]')
  })

  it('renders without a data-testid when none is given', () => {
    render(<PageTitle>Title</PageTitle>)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title')
  })
})
