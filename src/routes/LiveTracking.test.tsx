import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { LiveTracking } from './LiveTracking'

const account = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

function stubFetch(
  contractsResponse: Response | (() => Response),
  positionsResponse: Response | (() => Response) = new Response(
    JSON.stringify({ positions: [] }),
    { status: 200 },
  ),
) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/account.php')) {
        return Promise.resolve(new Response(JSON.stringify({ account }), { status: 200 }))
      }
      if (url.includes('/contracts/list.php')) {
        const response =
          typeof contractsResponse === 'function' ? contractsResponse() : contractsResponse
        return Promise.resolve(response)
      }
      if (url.includes('/devices/positions.php')) {
        const response =
          typeof positionsResponse === 'function' ? positionsResponse() : positionsResponse
        return Promise.resolve(response)
      }
      if (url.includes('/messages/global.php') || url.includes('/messages/contract.php')) {
        return Promise.resolve(new Response(JSON.stringify({ message: null }), { status: 200 }))
      }
      if (url.includes('/clients/logo-flag.php')) {
        return Promise.resolve(new Response(JSON.stringify({ hasLogo: false }), { status: 200 }))
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function renderLiveTracking() {
  return render(
    <MemoryRouter initialEntries={['/live-tracking']}>
      <AuthProvider>
        <Routes>
          <Route path="/live-tracking" element={<LiveTracking />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LiveTracking (KAN-158 FR1/FR2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders every contract the API returns, with the client name only when the API includes one (admin disclosure, FR2)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [
            { contractId: 12, contractRef: 'REF-012', contractType: 'STD', clientId: 7, clientName: 'Acme Corp' },
            { contractId: 34, contractRef: 'REF-034', contractType: 'MAIN' },
          ],
        }),
        { status: 200 },
      ),
    )

    renderLiveTracking()

    await waitFor(() => expect(screen.getByTestId('contract-selector')).toBeInTheDocument())
    expect(screen.getByTestId('contract-option-12')).toHaveTextContent('REF-012 (Acme Corp)')
    expect(screen.getByTestId('contract-option-34')).toHaveTextContent('REF-034')
    expect(screen.getByTestId('contract-option-34')).not.toHaveTextContent('(')
  })

  it('never renders a contract entry the API did not return (no client-side fabrication)', async () => {
    stubFetch(new Response(JSON.stringify({ contracts: [] }), { status: 200 }))

    renderLiveTracking()

    await waitFor(() => expect(screen.getByTestId('live-tracking-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('contract-selector')).not.toBeInTheDocument()
  })

  it('lets the user select a contract, toggling its checked state and mounting ContractPositions', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
    )

    renderLiveTracking()

    const option = await screen.findByTestId('contract-option-12')
    expect(option).toHaveAttribute('aria-checked', 'false')

    await userEvent.click(option)

    expect(option).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(screen.getByTestId('positions-empty')).toBeInTheDocument())
  })

  it('shows a generic error state on a service failure, never raw backend text', async () => {
    stubFetch(
      new Response(
        JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }),
        { status: 503 },
      ),
    )

    renderLiveTracking()

    await waitFor(() => expect(screen.getByTestId('live-tracking-error')).toBeInTheDocument())
    expect(screen.getByTestId('live-tracking-error')).not.toHaveTextContent('DB is down')
  })

  it('clears the selection and shows a generic message on an unauthorized/nonexistent contract, revealing nothing (KAN-168 FR15)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
      }),
    )

    renderLiveTracking()

    const option = await screen.findByTestId('contract-option-12')
    await userEvent.click(option)

    await waitFor(() => expect(screen.getByTestId('contract-access-error')).toBeInTheDocument())
    expect(option).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByTestId('positions-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('contract-access-error')).not.toHaveTextContent('12')
  })
})
