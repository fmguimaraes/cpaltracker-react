import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FleetMap } from './FleetMap'
import { deviceIcon } from './markers'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

const devices = [{ id: 'a', name: 'a', status: 'ok' as const, lat: 48.8, lng: 2.3 }]

describe('FleetMap layers popover', () => {
  it('renders `layersExtra` (e.g. the load legend) inside the layers popover, not on the map', async () => {
    render(<FleetMap devices={devices} layersExtra={<p data-testid="legend">Poids restant transporté</p>} />)
    expect(screen.queryByTestId('legend')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Map layers' }))
    const popover = await screen.findByRole('dialog')
    expect(within(popover).getByTestId('legend')).toHaveTextContent('Poids restant transporté')
    expect(within(popover).getByRole('switch', { name: /cluster/i })).toBeInTheDocument()
  })
})

describe('compact load marker', () => {
  it('keeps the chip label and the load dot, with a small state badge on it', () => {
    const html = String(deviceIcon({ id: 'CHIP-A', status: 'alert', load: 3 }, false, 'Alerte', false, true).options.html)
    expect(html).toContain('CHIP-A')
    expect(html).toContain('data-status-badge="alert"')
    expect(html).toMatch(/size-2 rounded-full ring-2 ring-card/)
    // Not compact, or no load: no badge (the state is the dot itself).
    expect(String(deviceIcon({ id: 'CHIP-A', status: 'alert', load: 3 }, false).options.html)).not.toContain('data-status-badge')
    expect(String(deviceIcon({ id: 'CHIP-A', status: 'alert' }, false, 'Alerte', false, true).options.html)).not.toContain('data-status-badge')
  })
})
