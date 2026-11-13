import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ContractTestShell } from '../contracts/ContractTestShell'
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
// The header contract choice is the kit Select (Radix), which relies on pointer capture and scrollIntoView.
beforeEach(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
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
  historyResponse: Response | ((url: string) => Response) = new Response(JSON.stringify(historyBody()), {
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
        const response = typeof historyResponse === 'function' ? historyResponse(url) : historyResponse
        return Promise.resolve(response.clone())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

/** Operator decision 2026-10-29: the contract choice is the header kit Select; options exist once it is open. */
async function chooseContract(contractId: number) {
  await userEvent.click(await screen.findByTestId('contract-selector'))
  await userEvent.click(await screen.findByTestId(`contract-option-${contractId}`))
}

function renderHistoryDashboard(initialPath = '/history') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/history" element={<ContractTestShell><HistoryDashboard /></ContractTestShell>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const STORAGE_KEY = 'cpaltracker:contract'

function contractsBody(...ids: number[]) {
  return new Response(
    JSON.stringify({
      contracts: ids.map((id) => ({ contractId: id, contractRef: `REF-0${id}`, contractType: 'STD' })),
    }),
    { status: 200 },
  )
}

const notFound = () =>
  new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), { status: 404 })

/** History stub answering 404 for the given contract ids (`/contracts/history.php/<id>`) and 200 otherwise. */
function historyRejecting(...rejected: number[]) {
  return (url: string) =>
    rejected.some((id) => url.includes(`/contracts/history.php/${id}`))
      ? notFound()
      : new Response(JSON.stringify(historyBody()), { status: 200 })
}

describe('HistoryDashboard (KAN-172 FR1, FR2, FR25, NFR5)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('lists every contract the API returns in the header Select and defaults to the first one (FR2, operator decision 2026-10-29)', async () => {
    stubFetch(contractsBody(12, 13))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-012')
    expect(screen.queryByTestId('history-dashboard-no-selection')).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId('contract-selector'))
    expect(await screen.findByTestId('contract-option-12')).toHaveTextContent('REF-012')
    expect(screen.getByTestId('contract-option-13')).toHaveTextContent('REF-013')
  })

  it('has no visible page title, only an sr-only h1 "Historique" (operator decision 2026-10-29)', async () => {
    stubFetch(contractsBody(12))

    renderHistoryDashboard()

    const heading = await screen.findByRole('heading', { level: 1, name: 'Historique' })
    expect(within(screen.getByTestId('page-header')).getByRole('heading', { level: 1 })).toBe(heading)
    expect(screen.getByTestId('page-header')).toHaveClass('[&_h1]:sr-only')
  })

  it('treats zero contracts as an explicit empty state, no selector (FR2)', async () => {
    stubFetch(new Response(JSON.stringify({ contracts: [] }), { status: 200 }))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('contract-selector')).not.toBeInTheDocument()
  })

  it('treats a missing contrat_id query param as "use the default contract", not an error (FR2)', async () => {
    stubFetch(contractsBody(12))

    renderHistoryDashboard('/history')

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.queryByTestId('history-access-error-banner')).not.toBeInTheDocument()
  })

  it('treats a non-numeric contrat_id query param as absent: default contract, no error (FR2)', async () => {
    stubFetch(contractsBody(12))

    renderHistoryDashboard('/history?contrat_id=not-a-number')

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-012')
    expect(screen.queryByTestId('history-access-error-banner')).not.toBeInTheDocument()
  })

  it('restores the contract remembered in sessionStorage when it is still in the list (operator decision 2026-10-29)', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '13')
    stubFetch(contractsBody(12, 13))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-013')
  })

  it('falls back to the first contract when the remembered one is no longer in the list (operator decision 2026-10-29)', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '77')
    stubFetch(contractsBody(12, 13))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-012')
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('12')
  })

  it('a contrat_id deep link wins over the remembered contract (operator decision 2026-10-29)', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '12')
    stubFetch(contractsBody(12, 13))

    renderHistoryDashboard('/history?contrat_id=13')

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-013')
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('13')
  })

  it('forgets a remembered contract the server rejects (FR25, operator decision 2026-10-29)', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '99')
    stubFetch(contractsBody(12, 99), historyRejecting(99))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-access-error-banner')).toBeInTheDocument())
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(screen.queryByTestId('history-dashboard-ready')).not.toBeInTheDocument()
  })

  it('still works when sessionStorage throws: defaults to the first contract', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    stubFetch(contractsBody(12, 13))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-012')
    vi.restoreAllMocks()
  })

  it('selecting a contract loads its history and renders the ready state (FR2)', async () => {
    stubFetch(contractsBody(12, 13))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    await chooseContract(13)

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    // Operator decision 2026-10-29: one control per concern, both in the header — the contract Select shows
    // the choice and the TimePicker is the only period control (no typed Du/Au entry, no period sentence).
    const header = within(screen.getByTestId('page-header'))
    await waitFor(() => expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-013'))
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('13')
    expect(header.getByTestId('time-picker')).toBeInTheDocument()
    // The device FilterBar sits in the header row (the contract Select now lives in the sidebar).
    expect(header.getByTestId('history-header-filters')).toContainElement(screen.getByTestId('filter-bar'))
    expect(screen.queryByRole('radiogroup', { name: 'Sélection du contrat' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('date-range-picker')).not.toBeInTheDocument()
    expect(screen.getByTestId('history-dashboard-ready')).not.toHaveTextContent(/période du/)
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
    stubFetch(contractsBody(12, 99), historyRejecting(99))

    renderHistoryDashboard()

    await waitFor(() => expect(screen.getByTestId('history-dashboard-ready')).toBeInTheDocument())
    await chooseContract(99)

    await waitFor(() => expect(screen.getByTestId('history-access-error-banner')).toBeInTheDocument())
    // The selection is cleared: the trigger falls back to its placeholder, and the rejected contract is forgotten.
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('Choisir un contrat')
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
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
