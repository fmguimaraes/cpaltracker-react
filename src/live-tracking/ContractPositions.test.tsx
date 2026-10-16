import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContractPositions } from './ContractPositions'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'

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
