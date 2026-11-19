import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { Trends } from './Trends'

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))

const account = {
  userId: 1, clientId: null, mail: 'demo@cpal.test', nom: 'Demo', prenom: 'User',
  role: 'client', telephone: null, lastLoginAt: null, mustChangePassword: false,
}
const lot = (n: string, risk: string, z: number, expiryDate: string) => ({
  cpalLot: `CPL-${n}`, custLotNumber: n, productName: `Produit ${n}`, balanceKg: 9800, referenceVelocity: 140,
  requiredVelocity: 217.1, z, risk, expiryDate,
})

function stub(contractType: string, trends: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/account.php')) return Promise.resolve(new Response(JSON.stringify({ account }), { status: 200 }))
      if (url.includes('/contracts/list.php'))
        return Promise.resolve(new Response(JSON.stringify({ contracts: [{ contractId: 4, contractRef: 'REF', contractType }] }), { status: 200 }))
      if (url.includes('/contracts/trends.php/4')) return Promise.resolve(trends())
      if (url.includes('/messages/') || url.includes('/clients/logo'))
        return Promise.resolve(new Response('{}', { status: 404 }))
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trends']}>
      <AuthProvider>
        <Routes>
          <Route path="/trends" element={<ContractTestShell><Trends /></ContractTestShell>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Trends (KAN-256)', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.releasePointerCapture ??= () => undefined
    Element.prototype.scrollIntoView ??= () => undefined
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows the chart and one table row per lot with its risk badge', async () => {
    stub('MAIN', () =>
      new Response(JSON.stringify({
        contract: { contractId: 4, contractRef: 'REF', contractType: 'MAIN' },
        lots: [lot('2026001', 'eleve', 2.4, '2027-10-01'), lot('2026002', 'faible', -0.7, '2027-10-09')],
      }), { status: 200 }),
    )
    renderPage()
    expect(await screen.findAllByTestId('trends-row')).toHaveLength(2)
    expect(screen.getByTestId('mock-plot')).toBeInTheDocument()
    expect(screen.getByText('Élevé')).toBeInTheDocument()
    expect(screen.getByText('Faible')).toBeInTheDocument()
    expect(screen.getByText('01/10/2027')).toBeInTheDocument()
  })

  it('shows the STD empty state', async () => {
    stub('STD', () =>
      new Response(JSON.stringify({ contract: { contractId: 4, contractRef: 'REF', contractType: 'STD' }, lots: [] }), { status: 200 }),
    )
    renderPage()
    expect(await screen.findByTestId('trends-std')).toBeInTheDocument()
  })

  it('shows the no-lot state', async () => {
    stub('MAIN', () =>
      new Response(JSON.stringify({ contract: { contractId: 4, contractRef: 'REF', contractType: 'MAIN' }, lots: [] }), { status: 200 }),
    )
    renderPage()
    expect(await screen.findByTestId('trends-empty')).toBeInTheDocument()
  })

  it('shows an error with a retry that refetches', async () => {
    let calls = 0
    stub('MAIN', () =>
      ++calls === 1
        ? new Response('{}', { status: 500 })
        : new Response(JSON.stringify({ contract: { contractId: 4, contractRef: 'REF', contractType: 'MAIN' }, lots: [lot('1', 'moyen', 0.5, '2027-10-01')] }), { status: 200 }),
    )
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findAllByTestId('trends-row')).toHaveLength(1)
  })

  it('shows the generic access error on a 404', async () => {
    stub('MAIN', () => new Response(JSON.stringify({ error: { code: 'not_found', message: 'x' } }), { status: 404 }))
    renderPage()
    expect(await screen.findByTestId('trends-access-error')).toBeInTheDocument()
  })
})
