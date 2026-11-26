import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractPositions } from './ContractPositions'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'

// FR8: the kit FleetMap observes its container; jsdom has no ResizeObserver,
// and the fleet panel's DonutChart pulls Plotly (covered in a real browser).
vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))
// jsdom has no layout, so the real clustered map never mounts markers; this
// stand-in renders one `.leaflet-marker-icon` per device handed to the kit map
// (the real markers/clusters are covered by e2e/live-tracking.spec.ts).
vi.mock('@/ui/map', () => ({
  FleetMap: ({ devices, labels, emptyFit, trails }: {
    devices: Array<{ id: string; name: string; status: string }>
    labels: { region: string }
    emptyFit?: Array<[number, number]>
    trails?: Array<{ id: string }>
  }) => (
    <div
      role="region"
      aria-label={labels.region}
      data-empty-fit={emptyFit ? JSON.stringify(emptyFit) : 'none'}
      data-trails={trails ? trails.map((t) => t.id).join(',') : 'none'}
    >
      {devices.map((d) => (
        <span key={d.id} className="leaflet-marker-icon" data-marker-id={d.id} title={`${d.id} – ${d.name} (${d.status})`} />
      ))}
    </div>
  ),
}))

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

const onePosition = {
  contractId: 12,
  chipId: 'CHIP-001',
  timestamp: '2026-10-10T08:00:05Z',
  latitude: 48.8566,
  longitude: 2.3522,
  ambientTemperature: 19.1,
  humidity: 55,
  mass: 420,
  mpuTemperature: 21.5,
  accelG: 1.02,
}

function stubFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/devices/positions.php')) return Promise.resolve(response.clone())
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

describe('ContractPositions (KAN-160 FR3/FR4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useDeviceVisibilityStore.getState().showAll()
  })

  it('renders exactly one marker per positioned device, omitting devices with no coordinates', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          positions: [
            {
              contractId: 12,
              chipId: 'CHIP-001',
              timestamp: '2026-10-10T08:00:05Z',
              latitude: 48.8566,
              longitude: 2.3522,
              ambientTemperature: 19.1,
              humidity: 55,
              mass: 420,
              mpuTemperature: 21.5,
              accelG: 1.02,
            },
            {
              contractId: 12,
              chipId: 'CHIP-002',
              timestamp: null,
              latitude: null,
              longitude: null,
              ambientTemperature: null,
              humidity: null,
              mass: null,
              mpuTemperature: null,
              accelG: null,
            },
          ],
        }),
        { status: 200 },
      ),
    )

    render(<ContractPositions contractId={12} />)

    await waitFor(() => expect(document.querySelector('.position-map')).toBeInTheDocument())
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1)
  })

  it('shows an explicit empty state when the contract has no positioned devices', async () => {
    stubFetch(new Response(JSON.stringify({ positions: [] }), { status: 200 }))

    render(<ContractPositions contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('positions-empty')).toBeInTheDocument())
    // Live Tracking (no `keepMapWhenEmpty`): the empty block replaces the map.
    expect(screen.queryByRole('region', { name: 'Carte de la flotte' })).not.toBeInTheDocument()
  })

  it('with `keepMapWhenEmpty`, an empty contract keeps the map (default centre) with the notice on it', async () => {
    stubFetch(new Response(JSON.stringify({ positions: [] }), { status: 200 }))

    render(<ContractPositions contractId={12} keepMapWhenEmpty />)

    const notice = await screen.findByTestId('positions-empty')
    expect(notice).toHaveTextContent('Aucune position disponible pour ce contrat.')
    expect(notice).toHaveAttribute('data-overlay', 'map')
    expect(notice).toHaveAttribute('role', 'status')
    const map = screen.getByRole('region', { name: 'Carte de la flotte' })
    expect(screen.getByTestId('live-split')).toContainElement(notice)
    // Nothing to frame on: the kit keeps its default centre.
    expect(map).toHaveAttribute('data-empty-fit', '[]')
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
  })

  it('with a period, hides devices whose latest report is outside it and shows a French empty message when none remain', async () => {
    const recent = new Date(Date.now() - 60 * 60_000).toISOString()
    stubFetch(
      new Response(
        JSON.stringify({
          positions: [
            { ...onePosition, chipId: 'CHIP-NEW', timestamp: recent },
            { ...onePosition, chipId: 'CHIP-OLD', timestamp: '2020-01-01T00:00:00Z' },
          ],
        }),
        { status: 200 },
      ),
    )

    const { rerender } = render(<ContractPositions contractId={12} period={{ preset: '24h' }} />)

    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
    expect(document.querySelector('[data-marker-id="CHIP-NEW"]')).toBeInTheDocument()
    expect(document.querySelector('[data-marker-id="CHIP-OLD"]')).not.toBeInTheDocument()

    rerender(
      <ContractPositions
        contractId={12}
        period={{ preset: 'custom', from: new Date('2019-01-01'), to: new Date('2019-01-02') }}
      />,
    )
    expect(screen.getByTestId('positions-period-empty')).toHaveTextContent(
      "Aucun appareil n'a émis de position sur cette période.",
    )
    expect(screen.getByTestId('positions-period-empty')).not.toHaveAttribute('data-overlay')
    expect(screen.queryByRole('region', { name: 'Carte de la flotte' })).not.toBeInTheDocument()
  })

  it('with `keepMapWhenEmpty`, an empty period keeps the map, framed on the last known positions, with the notice on it', async () => {
    const recent = new Date(Date.now() - 60 * 60_000).toISOString()
    stubFetch(
      new Response(
        JSON.stringify({
          positions: [
            { ...onePosition, chipId: 'CHIP-NEW', timestamp: recent },
            { ...onePosition, chipId: 'CHIP-OLD', timestamp: '2020-01-01T00:00:00Z', latitude: 45.76, longitude: 4.83 },
          ],
        }),
        { status: 200 },
      ),
    )
    const empty = { preset: 'custom' as const, from: new Date('2019-01-01'), to: new Date('2019-01-02') }

    const { rerender } = render(<ContractPositions contractId={12} period={{ preset: '24h' }} keepMapWhenEmpty />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
    expect(screen.queryByTestId('positions-period-empty')).not.toBeInTheDocument()

    rerender(<ContractPositions contractId={12} period={empty} keepMapWhenEmpty />)
    const notice = screen.getByTestId('positions-period-empty')
    expect(notice).toHaveTextContent("Aucun appareil n'a émis de position sur cette période.")
    expect(notice).toHaveAttribute('data-overlay', 'map')
    const map = screen.getByRole('region', { name: 'Carte de la flotte' })
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0)
    // Every last known position of the contract, whatever the period: the kit's fallback frame.
    expect(JSON.parse(map.getAttribute('data-empty-fit')!)).toEqual([
      [48.8566, 2.3522],
      [45.76, 4.83],
    ])
    // The refresh stays available.
    expect(screen.getByTestId('positions-refresh')).toBeInTheDocument()

    // Something drawn (e.g. a playback instant) hides the notice.
    rerender(<ContractPositions contractId={12} period={empty} keepMapWhenEmpty mapPositions={[{ ...onePosition, lot: null }]} />)
    expect(screen.queryByTestId('positions-period-empty')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1)
  })

  it('passes `trails` to the map only when given (Live Tracking draws none)', async () => {
    stubFetch(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))
    const { rerender } = render(<ContractPositions contractId={12} />)
    const map = await screen.findByRole('region', { name: 'Carte de la flotte' })
    expect(map).toHaveAttribute('data-trails', 'none')
    expect(map).toHaveAttribute('data-empty-fit', 'none')

    rerender(<ContractPositions contractId={12} trails={[{ id: 'CHIP-001', points: [[48, 2], [48.8, 2.3]] }]} />)
    expect(screen.getByRole('region', { name: 'Carte de la flotte' })).toHaveAttribute('data-trails', 'CHIP-001')
  })

  it('shows a generic error on a service failure, never raw backend text', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }), {
        status: 503,
      }),
    )

    render(<ContractPositions contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('positions-error')).toBeInTheDocument())
    expect(screen.getByTestId('positions-error')).not.toHaveTextContent('DB is down')
  })

  it('reports unauthorized via onUnauthorized on a 404, rendering no local error state (KAN-168 FR15)', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
      }),
    )
    const onUnauthorized = vi.fn()

    render(<ContractPositions contractId={12} onUnauthorized={onUnauthorized} />)

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('positions-error')).not.toBeInTheDocument()
  })

  it('treats a 403 as a generic error, not an unauthorized-contract signal (review gate: the only 403 this endpoint returns is mustChangePassword, unrelated to contract authorization)', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'must_change_password', message: 'Forbidden' } }), {
        status: 403,
      }),
    )
    const onUnauthorized = vi.fn()

    render(<ContractPositions contractId={12} onUnauthorized={onUnauthorized} />)

    await waitFor(() => expect(screen.getByTestId('positions-error')).toBeInTheDocument())
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('re-fetches when the contractId prop changes', async () => {
    let requestedContractId: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        requestedContractId = new URL(url).searchParams.get('contractId')
        return Promise.resolve(new Response(JSON.stringify({ positions: [] }), { status: 200 }))
      }),
    )

    const { rerender } = render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(requestedContractId).toBe('12'))

    rerender(<ContractPositions contractId={34} />)
    await waitFor(() => expect(requestedContractId).toBe('34'))
  })

  it('shows a last-updated time after the initial load succeeds', async () => {
    stubFetch(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))

    render(<ContractPositions contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('positions-last-updated')).toBeInTheDocument())
  })

  it('keeps showing the prior snapshot and a small inline error when a refresh fails', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        callCount += 1
        if (callCount === 1) {
          return Promise.resolve(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))
        }
        return Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }), {
            status: 503,
          }),
        )
      }),
    )

    render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(document.querySelector('.position-map')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('positions-refresh'))

    await waitFor(() => expect(screen.getByTestId('positions-refresh-error')).toBeInTheDocument())
    expect(document.querySelector('.position-map')).toBeInTheDocument()
    expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1)
  })

  it('updates last-updated and clears a prior refresh error once a refresh succeeds', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        callCount += 1
        if (callCount === 2) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }), {
              status: 503,
            }),
          )
        }
        return Promise.resolve(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))
      }),
    )

    render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(document.querySelector('.position-map')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('positions-refresh'))
    await waitFor(() => expect(screen.getByTestId('positions-refresh-error')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('positions-refresh'))
    await waitFor(() => expect(screen.queryByTestId('positions-refresh-error')).not.toBeInTheDocument())
  })

  it('filters a device out of the map when unchecked in the device filter', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          positions: [
            onePosition,
            { ...onePosition, chipId: 'CHIP-002', latitude: 45.75, longitude: 4.85 },
          ],
        }),
        { status: 200 },
      ),
    )

    render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('device-filter-CHIP-002'))

    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
  })

  it('resets the device filter to show-all when the contract changes', async () => {
    stubFetch(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))

    const { rerender } = render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))

    fireEvent.click(screen.getByTestId('device-filter-CHIP-001'))
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0))

    rerender(<ContractPositions contractId={34} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
  })

  it('discards a stale in-flight refresh if the contract changes before it resolves', async () => {
    const deferred: { resolve?: (response: Response) => void } = {}
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        callCount += 1
        if (callCount === 2) {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve
          })
        }
        if (callCount === 3) {
          return Promise.resolve(
            new Response(
              JSON.stringify({ positions: [{ ...onePosition, chipId: 'CHIP-OTHER' }] }),
              { status: 200 },
            ),
          )
        }
        return Promise.resolve(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))
      }),
    )

    const { rerender } = render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))

    fireEvent.click(screen.getByTestId('positions-refresh'))
    await waitFor(() => expect(callCount).toBe(2))

    rerender(<ContractPositions contractId={34} />)
    await waitFor(() => expect(screen.getByTestId('device-filter-CHIP-OTHER')).toBeInTheDocument())

    deferred.resolve?.(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.getByTestId('device-filter-CHIP-OTHER')).toBeInTheDocument()
    expect(screen.queryByTestId('device-filter-CHIP-001')).not.toBeInTheDocument()
  })
})

describe('ContractPositions non-blocking loading (KAN-344 FR15/FR16/FR22/FR23)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useDeviceVisibilityStore.getState().showAll()
  })

  it('mounts the map with a status loader while positions load, then drops the loader (AC12)', async () => {
    let resolve!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (resolve = r))))
    render(<ContractPositions contractId={12} />)

    expect(screen.getByRole('region', { name: 'Carte de la flotte' })).toBeInTheDocument()
    const loader = screen.getByTestId('positions-loading')
    expect(loader).toHaveAttribute('role', 'status')
    expect(loader).toHaveTextContent('Chargement des positions…')
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()

    resolve(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))
    await waitFor(() => expect(screen.queryByTestId('positions-loading')).not.toBeInTheDocument())
    expect(document.querySelector('.leaflet-marker-icon')).not.toBeNull()
  })

  it('shows the map and the loader without fetching while the contract is unknown (EC17)', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ContractPositions contractId={null} />)
    expect(screen.getByRole('region', { name: 'Carte de la flotte' })).toBeInTheDocument()
    expect(screen.getByTestId('positions-loading')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the map on a positions error and retries on "Réessayer" (AC17, EC15)', async () => {
    stubFetch(new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'x' } }), { status: 503 }))
    render(<ContractPositions contractId={12} />)
    await waitFor(() => expect(screen.getByTestId('positions-error')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Carte de la flotte' })).toBeInTheDocument()
    expect(screen.queryByTestId('positions-loading')).not.toBeInTheDocument()

    stubFetch(new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 }))
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(screen.queryByTestId('positions-error')).not.toBeInTheDocument())
    expect(document.querySelector('.leaflet-marker-icon')).not.toBeNull()
  })
})
