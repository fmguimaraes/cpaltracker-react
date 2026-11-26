import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FleetPanel } from './FleetPanel'

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))

describe('FleetPanel collapse (desktop)', () => {
  it('never stretches to the map height, and animates the body collapsed/reopened via its max-height transition', async () => {
    render(<FleetPanel statuses={['ok', 'alert']} />)
    const panel = screen.getByTestId('fleet-panel')
    const button = screen.getByRole('button', { name: 'Réduire le panneau de flotte' })
    const body = document.getElementById(button.getAttribute('aria-controls')!)!

    // Shrink-to-fit: the panel is capped to the map's height, never pinned to stretch across it.
    expect(panel).toHaveClass('md:max-h-panel-inset')
    expect(panel).not.toHaveClass('md:bottom-3')
    expect(body).toHaveClass('max-h-200')
    expect(body).not.toHaveClass('md:max-h-0')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(body).toHaveClass('md:max-h-0', 'md:overflow-hidden')
    expect(body).not.toHaveClass('max-h-200')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(body).toHaveClass('max-h-200')
    expect(body).not.toHaveClass('md:max-h-0')
  })
})
