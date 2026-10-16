import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContractPositions } from './ContractPositions'

function stubFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/devices/positions.php')) return Promise.resolve(response)
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

describe('ContractPositions (KAN-160 FR3/FR4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
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
})
