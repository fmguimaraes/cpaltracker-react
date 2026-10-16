import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevicePilotage } from './DevicePilotage'

function stubFetch(
  contractsResponse: Response,
  positionsResponse: Response = new Response(JSON.stringify({ positions: [] }), { status: 200 }),
  configResponse: Response = new Response('{}', { status: 200 }),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/contracts/list.php')) return Promise.resolve(contractsResponse.clone())
      if (url.includes('/devices/positions.php')) return Promise.resolve(positionsResponse.clone())
      if (url.includes('/devices/config.php')) return Promise.resolve(configResponse.clone())
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function renderDevicePilotage() {
  return render(
    <MemoryRouter initialEntries={['/pilotage']}>
      <Routes>
        <Route path="/pilotage" element={<DevicePilotage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DevicePilotage (KAN-159 FR1, FR2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders every contract the API returns, never filtered to MAIN only (NFR4)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [
            { contractId: 12, contractRef: 'REF-012', contractType: 'STD' },
            { contractId: 34, contractRef: 'REF-034', contractType: 'MAIN' },
          ],
        }),
        { status: 200 },
      ),
    )

    renderDevicePilotage()

    await waitFor(() => expect(screen.getByTestId('pilotage-contract-selector')).toBeInTheDocument())
    expect(screen.getByTestId('pilotage-contract-option-12')).toHaveTextContent('REF-012')
    expect(screen.getByTestId('pilotage-contract-option-34')).toHaveTextContent('REF-034')
  })

  it('shows an explicit empty state with no selector when the account has zero contracts', async () => {
    stubFetch(new Response(JSON.stringify({ contracts: [] }), { status: 200 }))

    renderDevicePilotage()

    await waitFor(() => expect(screen.getByTestId('pilotage-contracts-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('pilotage-contract-selector')).not.toBeInTheDocument()
  })

  it('selecting a contract mounts the pilotage workspace for it', async () => {
    stubFetch(
      new Response(
        JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }),
        { status: 200 },
      ),
    )

    renderDevicePilotage()

    const option = await screen.findByTestId('pilotage-contract-option-12')
    expect(option).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(option)

    expect(option).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(screen.getByTestId('pilotage-devices-empty')).toBeInTheDocument())
  })

  it('shows a generic error state on a contract-list service failure, never raw backend text', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }), {
        status: 503,
      }),
    )

    renderDevicePilotage()

    await waitFor(() => expect(screen.getByTestId('pilotage-contracts-error')).toBeInTheDocument())
    expect(screen.getByTestId('pilotage-contracts-error')).not.toHaveTextContent('DB is down')
  })

  it('clears the selection and shows a generic message on an unauthorized/nonexistent contract, revealing nothing', async () => {
    stubFetch(
      new Response(
        JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 }),
    )

    renderDevicePilotage()

    const option = await screen.findByTestId('pilotage-contract-option-12')
    await userEvent.click(option)

    await waitFor(() => expect(screen.getByTestId('pilotage-contract-access-error')).toBeInTheDocument())
    expect(option).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByTestId('pilotage-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('pilotage-contract-access-error')).not.toHaveTextContent('12')
  })
})
