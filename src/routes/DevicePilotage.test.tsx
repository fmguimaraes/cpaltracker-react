import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/ui/button'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { DevicePilotage } from './DevicePilotage'
import { PilotageDeviceDetail } from './PilotageDeviceDetail'
import { PilotageDeviceList } from './PilotageDeviceList'

function stubViewport(mobile = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches: mobile, addEventListener: () => undefined, removeEventListener: () => undefined }),
  })
  vi.stubGlobal('innerWidth', mobile ? 390 : 1440)
}

beforeEach(() => {
  stubViewport()
  // Radix Select (the header contract choice, KAN-227) relies on pointer capture and scrollIntoView.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
})

/** KAN-227: the contract choice is the kit Select; its options exist once it is open. */
async function openContracts() {
  await userEvent.click(await screen.findByTestId('contract-selector'))
}


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

/** The router's current path, and the browser's back button. */
function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.pathname}</output>
      <Button data-testid="browser-back" onClick={() => navigate(-1)}>
        back
      </Button>
    </>
  )
}

function renderDevicePilotage(entry = '/pilotage') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/pilotage" element={<ContractTestShell><DevicePilotage /></ContractTestShell>}>
          <Route index element={<PilotageDeviceList />} />
          <Route path=":chipId" element={<PilotageDeviceDetail />} />
        </Route>
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )
}

const mainContract = () =>
  new Response(JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }), { status: 200 })
const twoDevices = () =>
  new Response(
    JSON.stringify({
      positions: ['CHIP-001', 'CHIP-002'].map((chipId) => ({
        contractId: 12, chipId, timestamp: '2026-10-10T08:00:05Z', latitude: 48.8, longitude: 2.3,
        ambientTemperature: 19, humidity: 55, mass: 420, mpuTemperature: 21, accelG: 1,
      })),
    }),
    { status: 200 },
  )
const config = () =>
  new Response(JSON.stringify({ deviceId: 'CHIP-001', contractId: 12, reglageId: 1, updatedAt: null, config: {} }), { status: 200 })

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

    await waitFor(() => expect(screen.getByTestId('contract-selector')).toBeInTheDocument())
    await openContracts()
    expect(await screen.findByTestId('contract-option-12')).toHaveTextContent('REF-012')
    expect(screen.getByTestId('contract-option-34')).toHaveTextContent('REF-034')
  })

  it('shows an explicit empty state with no selector when the account has zero contracts', async () => {
    stubFetch(new Response(JSON.stringify({ contracts: [] }), { status: 200 }))

    renderDevicePilotage()

    await waitFor(() => expect(screen.getByTestId('pilotage-contracts-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('contract-selector')).not.toBeInTheDocument()
  })

  it('selecting a contract mounts the pilotage workspace for it', async () => {
    stubFetch(
      new Response(
        JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }),
        { status: 200 },
      ),
    )

    renderDevicePilotage()

    // The first contract is pre-selected (operator decision 2026-10-29).
    await waitFor(() => expect(screen.getByTestId('contract-selector')).toHaveTextContent('REF-012'))
    await waitFor(() => expect(screen.getByTestId('pilotage-devices-empty')).toBeInTheDocument())
    await openContracts()
    expect(await screen.findByTestId('contract-option-12')).toHaveAttribute('aria-selected', 'true')
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

    await waitFor(() => expect(screen.getByTestId('pilotage-contract-access-error')).toBeInTheDocument())
    // The selection is cleared: the trigger is back to its placeholder.
    expect(screen.getByTestId('contract-selector')).toHaveTextContent('Choisir un contrat')
    expect(screen.queryByTestId('pilotage-error')).not.toBeInTheDocument()
    expect(screen.getByTestId('pilotage-contract-access-error')).not.toHaveTextContent('12')
  })

  it('no H1 band: an sr-only h1, and the breadcrumb "Pilotage" (unified shell)', async () => {
    stubFetch(mainContract(), twoDevices(), config())
    renderDevicePilotage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Pilotage des devices' })).toHaveClass('sr-only')
    expect(screen.queryByTestId('page-header')).not.toBeInTheDocument()
    expect(screen.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pilotage')
  })

  it('a device pick navigates to its own page, "Pilotage › {device}" in the breadcrumb and the URL; back returns to the list', async () => {
    stubFetch(mainContract(), twoDevices(), config())
    renderDevicePilotage()
    await userEvent.click(await screen.findByTestId('pilotage-device-CHIP-001-select'))
    expect(screen.getByTestId('pilotage-device-page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/pilotage/CHIP-001')
    expect(screen.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pilotage › CHIP-001')

    // The browser's back returns to the list (a real route navigation, not an in-page panel).
    await userEvent.click(screen.getByTestId('browser-back'))
    await waitFor(() => expect(screen.queryByTestId('pilotage-device-page')).not.toBeInTheDocument())
    expect(screen.getByTestId('location')).toHaveTextContent('/pilotage')
    expect(screen.getByTestId('pilotage-workspace')).toBeInTheDocument()

    // The breadcrumb's "Pilotage" goes back the same way.
    await userEvent.click(await screen.findByTestId('pilotage-device-CHIP-001-select'))
    await userEvent.click(screen.getByTestId('breadcrumb-pilotage'))
    await waitFor(() => expect(screen.queryByTestId('pilotage-device-page')).not.toBeInTheDocument())
    expect(screen.getByTestId('pilotage-workspace')).toBeInTheDocument()
  })

  it('a deep link opens that device’s own page directly, with its settings and transfer forms', async () => {
    stubFetch(mainContract(), twoDevices(), config())
    renderDevicePilotage('/pilotage/CHIP-002')
    expect(await screen.findByTestId('pilotage-device-title')).toHaveTextContent('CHIP-002')
    expect(screen.getByTestId('breadcrumb-device')).toHaveTextContent('CHIP-002')
    // Same PAT-DETAIL header/section rhythm as the anomalies drawer detail (ui-guidelines.md PAT-DETAIL).
    expect(screen.getByTestId('pilotage-device-subtitle')).toBeInTheDocument()
    expect(screen.getByTestId('pilotage-device-settings-section')).toHaveTextContent('Configuration')
    expect(screen.getByTestId('pilotage-device-transfer-section')).toHaveTextContent('Transfert')
    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())
    expect(screen.getByTestId('transfer-form')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('pilotage-device-back'))
    await waitFor(() => expect(screen.queryByTestId('pilotage-device-page')).not.toBeInTheDocument())
    expect(screen.getByTestId('pilotage-workspace')).toBeInTheDocument()
    expect(screen.getByTestId('pilotage-transfer-history')).toBeInTheDocument()
  })

  it('a deep link to a device that is not on this contract shows an explicit not-found state', async () => {
    stubFetch(mainContract(), twoDevices(), config())
    renderDevicePilotage('/pilotage/CHIP-404')
    expect(await screen.findByTestId('pilotage-device-not-found')).toBeInTheDocument()
  })
})
