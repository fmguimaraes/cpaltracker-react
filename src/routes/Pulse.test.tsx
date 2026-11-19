import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { Pulse } from './Pulse'

const account = {
  userId: 1, clientId: null, mail: 'demo@cpal.test', nom: 'Demo', prenom: 'User',
  role: 'client', telephone: null, lastLoginAt: null, mustChangePassword: false,
}

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))

const position = (chipId: string, lot: object | null) => ({
  contractId: 12, chipId, timestamp: '2026-11-01T10:00:00+00:00', latitude: 48.8, longitude: 2.3,
  ambientTemperature: 20, humidity: 50, mass: 320, mpuTemperature: 21, accelG: 1, remainingWeight: 320, lot,
})
const lot = (cpalLot: string, custLotNumber: string, status = 'created') => ({
  cpalLot, custLotNumber, productName: 'Doliprane', expiryDate: '2027-05-31', status,
})

beforeEach(() => {
  window.sessionStorage.clear()
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = input.toString()
      const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      if (url.includes('/account.php')) return json({ account })
      if (url.includes('/contracts/list.php'))
        return json({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] })
      if (url.includes('/contracts/pulse.php/12'))
        return json({
          contract: { contractId: 12, active: true },
          positions: [
            position('CHIP-A', lot('LOT-A', 'L-001')),
            position('CHIP-B', lot('LOT-B', 'L-002', 'closed')),
            position('CHIP-C', null),
          ],
        })
      if (url.includes('/messages/contract.php')) return json({ message: null })
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function renderPulse() {
  return render(
    <MemoryRouter initialEntries={['/pulse']}>
      <AuthProvider>
        <Routes>
          <Route path="/pulse" element={<ContractTestShell><Pulse /></ContractTestShell>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Pulse (KAN-272)', () => {
  it('loads the contract from the Pulse endpoint and lists every device', async () => {
    renderPulse()
    expect(await screen.findByTestId('device-filter-CHIP-A')).toBeInTheDocument()
    expect(screen.getByTestId('device-filter-CHIP-B')).toBeInTheDocument()
    expect(screen.getByTestId('device-filter-CHIP-C')).toBeInTheDocument()
  })

  it('offers the lots (closed ones marked) and narrows the devices to the chosen lot', async () => {
    renderPulse()
    await screen.findByTestId('device-filter-CHIP-A')

    await userEvent.click(screen.getByTestId('pulse-lot-filter'))
    expect(await screen.findByTestId('pulse-lot-option-LOT-B')).toHaveTextContent('L-002 — Doliprane (clôturé)')
    await userEvent.click(screen.getByTestId('pulse-lot-option-LOT-A'))

    await waitFor(() => expect(screen.queryByTestId('device-filter-CHIP-B')).not.toBeInTheDocument())
    expect(screen.getByTestId('device-filter-CHIP-A')).toBeInTheDocument()
    expect(screen.queryByTestId('device-filter-CHIP-C')).not.toBeInTheDocument()
  })
})
