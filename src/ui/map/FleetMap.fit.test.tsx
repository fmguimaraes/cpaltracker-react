import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { House } from 'lucide-react'
import L from 'leaflet'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FleetMap } from './FleetMap'
import { deviceIcon } from './markers'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

const devices = [
  { id: 'a', name: 'a', status: 'ok' as const, lat: 48.8, lng: 2.3 },
  { id: 'b', name: 'b', status: 'ok' as const, lat: 43.3, lng: 5.4 },
]

describe('FleetMap fit control', () => {
  it('without overrides keeps the default fit button (Live Tracking)', () => {
    render(<FleetMap devices={devices} />)
    const fit = screen.getByRole('button', { name: 'Fit all devices in view' })
    expect(fit).toBeEnabled()
    expect(fit).not.toHaveAttribute('data-testid')
    expect(fit.querySelector('svg')?.getAttribute('class')).toMatch(/maximize/)
  })

  it('takes a label, icon, tooltip and disabled state from `fitControl`', async () => {
    const { rerender } = render(
      <FleetMap devices={devices} fitControl={{ label: 'Vue d’ensemble', tooltip: 'Vue d’ensemble', icon: House, disabled: true }} />,
    )
    const fit = screen.getByRole('button', { name: 'Vue d’ensemble' })
    expect(fit).toBeDisabled()
    expect(fit.querySelector('svg')?.getAttribute('class')).toMatch(/house/)
    // The tooltip sits on a wrapper, so it shows even while the button is disabled.
    await userEvent.hover(fit.parentElement!)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Vue d’ensemble')

    rerender(<FleetMap devices={devices} fitControl={{ label: 'Vue d’ensemble', icon: House, disabled: false }} />)
    expect(screen.getByRole('button', { name: 'Vue d’ensemble' })).toBeEnabled()
  })

  it('a new `fitRequest` frames every device (48 px padding, animated), even with an unchanged `fitKey`', () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds')
    const { rerender } = render(<FleetMap devices={devices} fitKey="k" fitRequest={0} />)
    fitBounds.mockClear()
    rerender(<FleetMap devices={devices} fitKey="k" fitRequest={0} />)
    expect(fitBounds).not.toHaveBeenCalled()
    rerender(<FleetMap devices={devices} fitKey="k" fitRequest={1} />)
    expect(fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, options] = fitBounds.mock.calls[0]
    expect((bounds as L.LatLngBounds).contains([43.3, 5.4])).toBe(true)
    expect((bounds as L.LatLngBounds).contains([48.8, 2.3])).toBe(true)
    expect(options).toMatchObject({ padding: [48, 48], animate: true })
    fitBounds.mockRestore()
  })
})

describe('FleetMap reveal with minZoom', () => {
  it('flies onto the device at the current zoom or `minZoom`, whichever is larger; the default reveal does not fly', () => {
    const flyTo = vi.spyOn(L.Map.prototype, 'flyTo').mockImplementation(function (this: L.Map) {
      return this
    })
    const getZoom = vi.spyOn(L.Map.prototype, 'getZoom')
    getZoom.mockReturnValue(6)
    const { rerender } = render(<FleetMap devices={devices} reveal={{ id: 'b', tick: 1, minZoom: 10 }} />)
    expect(flyTo).toHaveBeenLastCalledWith([43.3, 5.4], 10)

    getZoom.mockReturnValue(12)
    rerender(<FleetMap devices={devices} reveal={{ id: 'b', tick: 2, minZoom: 10 }} />)
    expect(flyTo).toHaveBeenLastCalledWith([43.3, 5.4], 12)

    flyTo.mockClear()
    rerender(<FleetMap devices={devices} reveal={{ id: 'a', tick: 3 }} />)
    expect(flyTo).not.toHaveBeenCalled()
    flyTo.mockRestore()
    getZoom.mockRestore()
  })
})

describe('compact markers', () => {
  const device = { id: 'CHIP-1', status: 'ok' as const, load: 3 as const }

  it('always show the id label, on one line', () => {
    const html = String(deviceIcon(device, false, 'OK', false, true).options.html)
    expect(html).not.toContain('group-hover:not-sr-only')
    expect(html).toContain('<span class="whitespace-nowrap">CHIP-1')
    // No truck icon in the compact dot.
    expect(html).not.toContain('<path d="M14 18V6')
  })

  it('show the label while selected or highlighted', () => {
    for (const [selected, highlighted] of [[true, false], [false, true]]) {
      const html = String(deviceIcon(device, selected, 'OK', highlighted, true).options.html)
      expect(html).not.toContain('group-hover:not-sr-only')
      expect(html).toContain('CHIP-1')
    }
  })

  it('leave the default pill unchanged', () => {
    const html = String(deviceIcon(device, false, 'OK').options.html)
    expect(html).toContain('<path d="M14 18V6')
    expect(html).not.toContain('group-hover:not-sr-only')
  })
})

describe('FleetMap background click', () => {
  it('calls `onMapClick` on a click on the map background', async () => {
    const onMapClick = vi.fn()
    const onSelect = vi.fn()
    const { container } = render(<FleetMap devices={devices} onMapClick={onMapClick} onSelect={onSelect} />)
    const map = container.querySelector('.leaflet-container') as HTMLElement
    await userEvent.click(map)
    expect(onMapClick).toHaveBeenCalledTimes(1)
  })
})
