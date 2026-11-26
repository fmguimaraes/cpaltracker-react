import { render, screen } from '@testing-library/react'
import { House } from 'lucide-react'
import L from 'leaflet'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FleetMap } from './FleetMap'

// jsdom has neither SVG nor canvas, so Leaflet has no renderer for vector layers: the polylines are
// stood in for by elements carrying the props the kit gives them.
vi.mock('react-leaflet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-leaflet')>()),
  Polyline: ({ positions, interactive, pathOptions }: {
    positions: Array<[number, number]>
    interactive?: boolean
    pathOptions?: { color?: string; weight?: number; opacity?: number; dashArray?: string }
  }) => (
    <span
      data-testid="polyline"
      data-positions={JSON.stringify(positions)}
      data-interactive={String(interactive)}
      data-color={pathOptions?.color ?? ''}
      data-weight={pathOptions?.weight ?? ''}
      data-dash={pathOptions?.dashArray ?? ''}
    />
  ),
}))

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const devices = [
  { id: 'a', name: 'a', status: 'ok' as const, lat: 48.8, lng: 2.3 },
  { id: 'b', name: 'b', status: 'ok' as const, lat: 43.3, lng: 5.4 },
]

describe('FleetMap trails', () => {
  it('draws one non-interactive polyline per trail of two points or more, in the primary colour', () => {
    const trails = [
      { id: 'a', points: [[47.2, -1.55], [47.9, 1.9], [48.8, 2.3]] as Array<[number, number]> },
      { id: 'b', points: [[43.6, 1.44], [43.3, 5.4]] as Array<[number, number]> },
      { id: 'c', points: [[45, 5]] as Array<[number, number]> },
    ]
    const { rerender } = render(<FleetMap devices={devices} trails={trails} />)
    const lines = screen.getAllByTestId('polyline')
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => JSON.parse(l.dataset.positions!))).toEqual([trails[0].points, trails[1].points])
    for (const line of lines) {
      expect(line).toHaveAttribute('data-interactive', 'false')
      // Chart theme primary, thin and dashed (2.5 px light, 2 px dark; owner 2026-11-26).
      expect(['2', '2.5']).toContain(line.dataset.weight)
      expect(line).toHaveAttribute('data-dash', '6 6')
      expect(line).toHaveAttribute('data-color')
    }

    // A longer trail (the instant moved on) replaces the old one; none once `trails` is empty.
    rerender(<FleetMap devices={devices} trails={[{ id: 'a', points: [[47.2, -1.55], [47.9, 1.9]] }]} />)
    expect(screen.getAllByTestId('polyline')).toHaveLength(1)
    rerender(<FleetMap devices={devices} trails={[]} />)
    expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
  })

  it('draws none without the prop (Live Tracking, History)', () => {
    render(<FleetMap devices={devices} />)
    expect(screen.queryByTestId('polyline')).not.toBeInTheDocument()
  })
})

describe('FleetMap with no device', () => {
  it('renders tiles and controls without throwing; reports its viewport; the fit control is a no-op', () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds')
    const onViewportChange = vi.fn()
    render(
      <FleetMap
        devices={[]}
        fitKey="k"
        fitRequest={1}
        onViewportChange={onViewportChange}
        highlightedId="a"
        reveal={{ id: 'a', tick: 1, minZoom: 10 }}
        fitControl={{ label: 'Vue d’ensemble', icon: House, disabled: true }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vue d’ensemble' })).toBeDisabled()
    expect(onViewportChange).toHaveBeenCalled()
    expect(fitBounds).not.toHaveBeenCalled()
  })

  it('opens on `emptyFit` when it was never framed, then keeps its view while still empty', () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds')
    const emptyFit: Array<[number, number]> = [[48.8, 2.3], [45.76, 4.83]]
    const { rerender } = render(<FleetMap devices={[]} fitKey="k1" emptyFit={emptyFit} />)
    expect(fitBounds).toHaveBeenCalledTimes(1)
    const [bounds, options] = fitBounds.mock.calls[0]
    expect((bounds as L.LatLngBounds).contains([45.76, 4.83])).toBe(true)
    expect(options).toMatchObject({ animate: false })

    // Another empty period: the view stays where it is.
    rerender(<FleetMap devices={[]} fitKey="k2" emptyFit={emptyFit} />)
    rerender(<FleetMap devices={[]} fitKey="k2" fitRequest={1} emptyFit={emptyFit} />)
    expect(fitBounds).toHaveBeenCalledTimes(1)

    // Devices are back: framed on them.
    rerender(<FleetMap devices={devices} fitKey="k2" fitRequest={1} emptyFit={emptyFit} />)
    expect(fitBounds).toHaveBeenCalledTimes(2)
    expect((fitBounds.mock.calls[1][0] as L.LatLngBounds).contains([43.3, 5.4])).toBe(true)
  })

  it('keeps the current view when its devices go away, even with `emptyFit`', () => {
    const fitBounds = vi.spyOn(L.Map.prototype, 'fitBounds')
    const { rerender } = render(<FleetMap devices={devices} fitKey="k1" emptyFit={[[0, 0], [1, 1]]} />)
    expect(fitBounds).toHaveBeenCalledTimes(1)
    rerender(<FleetMap devices={[]} fitKey="k2" emptyFit={[[0, 0], [1, 1]]} />)
    expect(fitBounds).toHaveBeenCalledTimes(1)
  })
})
