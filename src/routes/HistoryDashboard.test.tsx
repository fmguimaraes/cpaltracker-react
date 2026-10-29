import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { HistoryDashboard } from './HistoryDashboard'

// KAN-175: the ready state now mounts `HistoryReadyPanel` -> `HistoryCharts`,
// which imports real Plotly (`plotly.js-dist-min`) — it renders onto a
// `<canvas>` and probes WebGL at import time, neither of which jsdom
// implements (see `HistoryCharts.test.tsx`'s comment for the full
// explanation). Mocked here too so this file's own fixtures (which don't
// exercise the charts themselves) stay free of that unrelated noise.
vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({
  default: () => () => null,
}))

// The ready state mounts the kit Slider (Radix), which observes its thumb; jsdom has no ResizeObserver.
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

function historyBody(overrides: Partial<{ ContratRef: string }> = {}) {
  return {
    contract: {
      ContratID: 12,
      ContratRef: 'REF-12',
      ContratType: 'STANDARD',
      ClientID: 1,
      DebutContrat: null,
      FinContrat: null,
      ...overrides,
    },
    devices: [],
    rows: [],
    hooks: [],
    count: 0,
    total: 0,
    sampled: false,
  }
}

function stubFetch(
  contractsResponse: Response | (() => Response),
  historyResponse: Response | (() => Response) = new Response(JSON.stringify(historyBody()), {
    status: 200,
  }),
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
        return Promise.resolve(response.clone())
      }
      if (url.includes('/contracts/history.php')) {
        const response = typeof historyResponse === 'function' ? historyResponse() : historyResponse
        return Promise.resolve(response.clone())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function renderHistoryDashboard(initialPath = '/history') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/history" element={<HistoryDashboard />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('HistoryDashboard (KAN-172 FR1, FR2, FR25, NFR5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders every contract the API returns, scoped to the caller, with no data panels until one is selected (FR2)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
    )

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-contract-selector')).toBeInTheDocument())
    expect(screen.getByTestId('history-contract-option-12')).toHaveTextContent('REF-012')
    expect(screen.getByTestId('history-dashboard-no-selection')).toBeInTheDocument()
    expect(screen.queryByTestId('history-dashboard-ready')).not.toBeInTheDocument()
  })

  it('treats zero contracts as an explicit empty state, no selector (FR2)', async () => {
    stubFetch(new Response(JSON.stringify({ contracts: [] }), { status: 200 }))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('history-contract-selector')).not.toBeInTheDocument()
  })

  it('treats a missing contrat_id query param as "no contract selected", not an error (FR2)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
    )

    renderHistoryDashboard('/history')

    await waitFor(() => expect(screen.getByTestId('history-dashboard-no-selection')).toBeInTheDocument())
  })

  it('treats a non-numeric contrat_id query param as "no contract selected", not an error (FR2)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
    )

    renderHistoryDashboard('/history?contrat_id=not-a-number')

    await waitFor(() => expect(screen.getByTestId('history-dashboard-no-selection')).toBeInTheDocument())
    expect(screen.queryByTestId('history-access-error-banner')).not.toBeInTheDocument()
  })

  it('selecting a contract loads its history and renders the ready placeholder (FR2)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
    )

    renderHistoryDashboard()

    const option = await screen.findByTestId('history-contract-option-12')
    await userEvent.click(option)

    expect(option).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('history-dashboard-ready')).toHaveTextContent('REF-12')
    // FR9: the contract is a FilterBar chip, the TimePicker sits in the header, and the Stat row
    // replaces the text summary (F-40).
    expect(screen.getByTestId('filter-chip')).toHaveTextContent('Contrat = REF-012')
    expect(within(screen.getByTestId('page-header')).getByTestId('time-picker')).toBeInTheDocument()
    expect(screen.getByTestId('history-dashboard-ready')).not.toHaveTextContent(/appareil\(s\), \d+ mesure\(s\)/)
    expect(screen.getByTestId('selection-summary')).toBeInTheDocument()
  })

  it('accepts a numeric contrat_id query param as the initial selection and loads it directly (FR2, deep link from Live Tracking)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
    )

    renderHistoryDashboard('/history?contrat_id=12')

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
  })

  it('clears the selection and shows one generic, non-identifying message for an unauthorized/nonexistent contract (FR25, NFR5)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 99, contractRef: 'REF-099', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
      }),
    )

    renderHistoryDashboard()

    const option = await screen.findByTestId('history-contract-option-99')
    await userEvent.click(option)

    await waitFor(() => expect(screen.getByTestId('history-access-error-banner')).toBeInTheDocument())
    expect(option).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('history-access-error-banner')).not.toHaveTextContent('99')
    expect(screen.queryByTestId('history-dashboard-ready')).not.toBeInTheDocument()
  })

  it('shows the same merged message for a contrat_id deep link into an unauthorized/nonexistent contract (FR25, NFR5)', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          contracts: [{ contractId: 99, contractRef: 'REF-099', contractType: 'STD' }],
        }),
        { status: 200 },
      ),
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
      }),
    )

    renderHistoryDashboard('/history?contrat_id=404')

    await waitFor(() => expect(screen.getByTestId('history-access-error-banner')).toBeInTheDocument())
    expect(screen.getByTestId('history-access-error-banner')).not.toHaveTextContent('404')
  })

  it('shows a generic error state on a contracts-list service failure, never raw backend text', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }), {
        status: 503,
      }),
    )

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-error')).toBeInTheDocument())
    expect(screen.getByTestId('history-dashboard-error')).not.toHaveTextContent('DB is down')
  })
})
