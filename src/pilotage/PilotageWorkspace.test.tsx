import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PilotageWorkspace } from './PilotageWorkspace'

function stubFetch(responder: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      return Promise.resolve(responder(url))
    }),
  )
}

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

describe('PilotageWorkspace (KAN-159 FR2-FR6, NFR2, NFR4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a loading state before the API responds', () => {
    stubFetch(() => new Response(JSON.stringify({ positions: [] }), { status: 200 }))

    render(<PilotageWorkspace contractId={12} />)

    expect(screen.getByTestId('pilotage-loading')).toBeInTheDocument()
  })

  it('shows the device list once the contract is confirmed eligible (FR3, FR5)', async () => {
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 })
      }
      return new Response(
        JSON.stringify({ deviceId: 'CHIP-001', contractId: 12, reglageId: 1, updatedAt: null, config: {} }),
        { status: 200 },
      )
    })

    render(<PilotageWorkspace contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('pilotage-device-CHIP-001')).toBeInTheDocument())
    expect(screen.queryByTestId('pilotage-ineligible')).not.toBeInTheDocument()
  })

  it('shows the API\'s own reserved-for-MAIN message and no device list when ineligible (FR3, NFR4)', async () => {
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(JSON.stringify({ positions: [onePosition] }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          error: { code: 'forbidden', message: 'Device pilotage is limited to MAIN contracts.' },
        }),
        { status: 403 },
      )
    })

    render(<PilotageWorkspace contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('pilotage-ineligible')).toBeInTheDocument())
    expect(screen.getByTestId('pilotage-ineligible')).toHaveTextContent(
      'Device pilotage is limited to MAIN contracts.',
    )
    expect(screen.queryByTestId('pilotage-device-list')).not.toBeInTheDocument()
  })

  it('shows an explicit empty state for a contract with zero devices (FR5)', async () => {
    stubFetch(() => new Response(JSON.stringify({ positions: [] }), { status: 200 }))

    render(<PilotageWorkspace contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('pilotage-devices-empty')).toBeInTheDocument())
  })

  it('shows a generic error on a service failure, never raw backend text', async () => {
    stubFetch(
      () =>
        new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }), {
          status: 503,
        }),
    )

    render(<PilotageWorkspace contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('pilotage-error')).toBeInTheDocument())
    expect(screen.getByTestId('pilotage-error')).not.toHaveTextContent('DB is down')
  })

  it('reports unauthorized via onUnauthorized on a 404, rendering no local error state', async () => {
    stubFetch(
      () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 }),
    )
    const onUnauthorized = vi.fn()

    render(<PilotageWorkspace contractId={12} onUnauthorized={onUnauthorized} />)

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('pilotage-error')).not.toBeInTheDocument()
  })

  it('re-resolves eligibility when the contractId prop changes', async () => {
    let requestedContractId: string | null = null
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        requestedContractId = new URL(url).searchParams.get('contractId')
        return new Response(JSON.stringify({ positions: [] }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })

    const { rerender } = render(<PilotageWorkspace contractId={12} />)
    await waitFor(() => expect(requestedContractId).toBe('12'))

    rerender(<PilotageWorkspace contractId={34} />)
    await waitFor(() => expect(requestedContractId).toBe('34'))
  })
})
