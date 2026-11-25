import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnomalyRow } from '../api/anomalies'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { Alerts } from './Alerts'

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
  // Radix Select (the sidebar's contract choice) relies on pointer capture and scrollIntoView.
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
  // Radix tooltips (opened by focus) measure their content.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

afterEach(() => vi.unstubAllGlobals())

const row = (overrides: Partial<AnomalyRow>): AnomalyRow => ({
  anomalyKey: 'K1',
  status: 'detectee',
  code: 'TH',
  label: 'Température >= 28 °C',
  threshold: 28,
  value: 31,
  excess: 3,
  unit: '°C',
  eventDate: '2026-11-05 21:57:00',
  detectedAt: '2026-11-05 22:10:00',
  chipId: 'CHIP-001',
  lot: { cpalLot: 'CP-1', custLotNumber: 'L-100', productName: 'Yaourt' },
  ...overrides,
})

const ROWS: AnomalyRow[] = [
  row({ anomalyKey: 'K1' }),
  row({ anomalyKey: 'K2', status: 'en_cours', code: 'HH', label: 'Humidité >= 80 %', threshold: 80, value: 85, excess: 5, unit: '%HR', chipId: 'CHIP-002', lot: null }),
  row({ anomalyKey: 'K3', status: 'cloturee', code: 'GH', label: 'Choc', threshold: 4, value: 6, excess: 2, unit: 'g' }),
  row({ anomalyKey: 'K4', status: 'detectee', code: 'GH', label: 'Choc', threshold: 4, value: 5, excess: 1, unit: 'g', chipId: 'CHIP-002', lot: null }),
]

/** Intl uses (narrow) non-breaking spaces in numbers. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

let listUrls: string[] = []

function stubFetch(anomalies: Response | (() => Response) = () => new Response(JSON.stringify({ anomalies: ROWS }), { status: 200 })) {
  listUrls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/contracts/list.php')) {
        return Promise.resolve(
          new Response(JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }), { status: 200 }),
        )
      }
      if (url.includes('/anomalies/list.php')) {
        listUrls.push(url)
        return Promise.resolve(typeof anomalies === 'function' ? anomalies() : anomalies.clone())
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

function Probe() {
  const location = useLocation()
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state)}>
      {location.pathname + location.search}
    </output>
  )
}

function renderAlerts(entry = '/alertes') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/alertes" element={<ContractTestShell><Alerts /></ContractTestShell>} />
        <Route path="/alertes/:anomalyKey" element={<p>detail</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  )
}

const visibleKeys = () => screen.getAllByTestId(/^alert-row-/).map((item) => item.dataset.testid?.replace('alert-row-', ''))

describe('Alerts (list page)', () => {
  it('has an sr-only h1 and lists the open alerts of the contract, new first, in a table', async () => {
    stubFetch()
    renderAlerts()

    expect(screen.getByRole('heading', { level: 1, name: 'Alertes' })).toHaveClass('sr-only')
    expect(await screen.findByTestId('alerts-table')).toBeInTheDocument()
    // Open = À traiter + En cours; K3 is closed. New first (K1, K4 by event date), then in progress.
    expect(visibleKeys()).toEqual(['K1', 'K4', 'K2'])
    const first = screen.getByTestId('alert-row-K1')
    expect(first).toHaveTextContent('À traiter')
    expect(first).toHaveTextContent('Température')
    expect(first).toHaveTextContent('CHIP-001')
    expect(first).toHaveTextContent('L-100 · Yaourt')
    const text = plain(first.textContent)
    expect(text).toContain('31 °C')
    expect(text).toContain('seuil 28 °C')
    expect(text).toContain('+3 °C')
    expect(screen.getByTestId('alerts-count')).toHaveTextContent('3 alertes')
    // Every status is requested once (the server default would hide `cloturee`).
    expect(listUrls).toHaveLength(1)
    expect(listUrls[0]).toContain('cloturee')
  })

  it('shows the status counts and includes the closed alerts on demand', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderAlerts()
    await screen.findByTestId('alerts-table')

    expect(screen.getByTestId('alerts-status-count-open')).toHaveTextContent('3')
    expect(screen.getByTestId('alerts-status-count-closed')).toHaveTextContent('1')
    expect(screen.getByTestId('alerts-status-count-all')).toHaveTextContent('4')

    await user.click(screen.getByTestId('alerts-status-all'))
    expect(visibleKeys()).toHaveLength(4)
    expect(screen.getByTestId('location')).toHaveTextContent('/alertes?statut=all')

    await user.click(screen.getByTestId('alerts-status-closed'))
    expect(visibleKeys()).toEqual(['K3'])
  })

  it('filters by type from the chips, kept in the URL, and resets from the empty state', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderAlerts()
    await screen.findByTestId('alerts-table')

    expect(screen.getByTestId('alerts-type-temperature')).toHaveTextContent('1')
    await user.click(screen.getByTestId('alerts-type-shock'))
    expect(visibleKeys()).toEqual(['K4'])
    expect(screen.getByTestId('location')).toHaveTextContent('type=shock')
    // The chip of the isolated type stays pressed, the others are released.
    expect(screen.getByTestId('alerts-type-shock')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('alerts-type-humidity')).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies ?device= as a removable chip, and every filter drops with it', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderAlerts('/alertes?device=CHIP-002')

    await screen.findByTestId('alerts-table')
    expect(screen.getByTestId('alerts-device-chip')).toHaveTextContent('CHIP-002')
    expect(visibleKeys()).toEqual(['K4', 'K2'])
    // The counts follow the device filter too.
    expect(screen.getByTestId('alerts-status-count-all')).toHaveTextContent('2')

    await user.click(screen.getByTestId('alerts-device-remove'))
    expect(screen.queryByTestId('alerts-device-chip')).not.toBeInTheDocument()
    expect(visibleKeys()).toEqual(['K1', 'K4', 'K2'])
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/alertes$/)
  })

  it('opens the alert on one row click, carrying the list query for its back button', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderAlerts('/alertes?statut=all')
    await screen.findByTestId('alerts-table')

    await user.click(screen.getByTestId('alert-row-K2'))
    expect(screen.getByTestId('location')).toHaveTextContent('/alertes/K2')
    expect(JSON.parse(screen.getByTestId('location').dataset.state ?? 'null')).toEqual({ listSearch: '?statut=all' })
  })

  it('opens the alert from the keyboard through the type link', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderAlerts()
    const link = await screen.findByTestId('alert-link-K1')
    link.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByTestId('location')).toHaveTextContent('/alertes/K1')
  })

  it('shows the contracts skeleton while nothing has answered', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    renderAlerts()
    expect(screen.getByTestId('alerts-contracts-loading')).toBeInTheDocument()
  })

  it('explains an empty contract, and offers the closed ones when only they exist', async () => {
    const user = userEvent.setup()
    stubFetch(new Response(JSON.stringify({ anomalies: [ROWS[2]] }), { status: 200 }))
    renderAlerts()

    const empty = await screen.findByTestId('alerts-empty')
    expect(empty).toHaveTextContent('Aucune anomalie ouverte')
    await user.click(within(empty).getByTestId('alerts-show-all'))
    expect(visibleKeys()).toEqual(['K3'])
  })

  it('says so when the filtered device has no alert, with a way out', async () => {
    const user = userEvent.setup()
    stubFetch()
    renderAlerts('/alertes?device=NOPE')
    const empty = await screen.findByTestId('alerts-empty')
    expect(empty).toHaveTextContent('NOPE')
    await user.click(within(empty).getByTestId('alerts-device-reset'))
    await waitFor(() => expect(visibleKeys()).toHaveLength(3))
  })

  it('shows an inline error with a retry', async () => {
    const user = userEvent.setup()
    let fail = true
    stubFetch(() => (fail ? new Response('{}', { status: 500 }) : new Response(JSON.stringify({ anomalies: ROWS }), { status: 200 })))
    renderAlerts()

    const error = await screen.findByTestId('alerts-error')
    expect(error).toHaveTextContent('Impossible de charger les alertes.')
    fail = false
    await user.click(within(error).getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByTestId('alerts-table')).toBeInTheDocument()
  })

  it('renders the kit MobileList cards below md, each one a link to the alert', async () => {
    const user = userEvent.setup()
    stubViewport(true)
    stubFetch()
    renderAlerts()

    expect(await screen.findByTestId('alerts-list')).toBeInTheDocument()
    expect(screen.queryByTestId('alerts-table')).not.toBeInTheDocument()
    expect(visibleKeys()).toEqual(['K1', 'K4', 'K2'])
    expect(screen.getByTestId('alert-row-K1')).toHaveTextContent('CHIP-001')
    await user.click(screen.getByTestId('alert-link-K2'))
    expect(screen.getByTestId('location')).toHaveTextContent('/alertes/K2')
  })
})
