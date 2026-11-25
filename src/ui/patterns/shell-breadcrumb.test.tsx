import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ShellBreadcrumb, breadcrumbPath } from './shell-breadcrumb'

describe('ShellBreadcrumb (unified shell §1.2)', () => {
  it('every level but the last is clickable; middle levels truncate; the full path is the tooltip', async () => {
    const toRoot = vi.fn()
    const toPallet = vi.fn()
    const levels = [
      { label: 'Pulse', onSelect: toRoot },
      { label: 'CHIP-A-AVEC-UN-TRES-LONG-NOM', onSelect: toPallet },
      { label: 'Température max 31 °C' },
    ]
    render(<ShellBreadcrumb levels={levels} />)
    const nav = screen.getByRole('navigation', { name: 'Fil d’Ariane' })
    expect(nav).toHaveAttribute('title', 'Pulse › CHIP-A-AVEC-UN-TRES-LONG-NOM › Température max 31 °C')
    expect(breadcrumbPath(levels)).toBe(nav.getAttribute('title'))

    expect(screen.getByTestId('breadcrumb-level-1')).toHaveClass('truncate')
    expect(screen.getByTestId('breadcrumb-level-1').closest('li')).toHaveClass('max-w-48')
    expect(screen.getByTestId('breadcrumb-level-0').closest('li')).toHaveClass('shrink-0')
    const last = screen.getByTestId('breadcrumb-level-2')
    expect(last).toHaveAttribute('aria-current', 'page')
    expect(last.tagName).not.toBe('BUTTON')

    await userEvent.click(screen.getByRole('button', { name: 'Pulse' }))
    expect(toRoot).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'CHIP-A-AVEC-UN-TRES-LONG-NOM' }))
    expect(toPallet).toHaveBeenCalledTimes(1)
  })

  it('a level with `to` is a link; a single level is just the page', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ShellBreadcrumb levels={[{ label: 'Tendances', to: '/trends' }, { label: 'Risque de péremption' }]} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Tendances' })).toHaveAttribute('href', '/trends')
    rerender(
      <MemoryRouter>
        <ShellBreadcrumb levels={[{ label: 'Pilotage' }]} />
      </MemoryRouter>,
    )
    // The current level is the kit's page item (aria-disabled), never a live link.
    expect(screen.queryByRole('link', { name: 'Tendances' })).not.toBeInTheDocument()
    expect(screen.getByTestId('breadcrumb-level-0')).toHaveAttribute('aria-current', 'page')
  })
})
