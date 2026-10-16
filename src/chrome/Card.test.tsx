import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card (KAN-171 FR12)', () => {
  it('renders its children inside a token-driven soft-shadow surface', () => {
    render(
      <Card data-testid="the-card" className="extra-class">
        <p>content</p>
      </Card>,
    )

    const card = screen.getByTestId('the-card')
    expect(card).toHaveTextContent('content')
    expect(card.className).toContain('extra-class')
    expect(card.className).toContain('rounded-[length:var(--radius-lg)]')
    expect(card).toHaveStyle({
      backgroundColor: 'var(--color-surface)',
      borderColor: 'var(--color-border)',
      boxShadow: 'var(--shadow-md)',
    })
  })
})
