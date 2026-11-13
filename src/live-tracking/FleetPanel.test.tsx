import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FleetPanel } from './FleetPanel'

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))

describe('FleetPanel collapse (desktop)', () => {
  it('drops the bottom inset and hides the body when collapsed, and restores both when reopened', async () => {
    render(<FleetPanel statuses={['ok', 'alert']} />)
    const panel = screen.getByTestId('fleet-panel')
    const button = screen.getByRole('button', { name: 'Réduire le panneau de flotte' })
    const body = document.getElementById(button.getAttribute('aria-controls')!)!

    expect(panel).toHaveClass('md:bottom-3')
    expect(body).not.toHaveClass('md:hidden')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toHaveClass('md:bottom-3')
    expect(body).toHaveClass('md:hidden')

    await userEvent.click(button)
    expect(panel).toHaveClass('md:bottom-3')
    expect(body).not.toHaveClass('md:hidden')
  })
})
