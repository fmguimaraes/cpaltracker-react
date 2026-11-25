import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnomalyDetail } from '../api/anomalies'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { AlertDetail } from './AlertDetail'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  })
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

afterEach(() => vi.unstubAllGlobals())

const detail: AnomalyDetail = {
  anomalyKey: '80480-2',
  status: 'en_cours',
  code: 'TH',
  label: 'Température >= 19 °C',
  threshold: 19,
  value: 19.5,
  excess: 0.5,
  unit: '°C',
  eventDate: '2026-11-05 21:57:00',
  detectedAt: '2026-11-19 15:34:02.120',
  chipId: 'cpaldev021',
  lot: { cpalLot: 'CP-1', custLotNumber: 'L-100', productName: 'Yaourt' },
  contract: { contractId: 12, contractType: 'MAIN' },
  rule: 'TH19',
  readings: { temperature: 19.5, humidity: 55, mass: null, acceleration: null },
  position: { lat: 43.48, lng: 5.37 },
  referencePoint: null,
  allowedTransitions: [{ to: 'fermee', commentRequired: true }],
  readOnlyReason: null,
  lastChange: { at: '2026-11-19 15:37:24.916', by: { name: 'Marie Durand', sameOrganisation: true } },
  history: [
    {
      at: '2026-11-19 15:37:24.916',
      from: 'detectee',
      to: 'en_cours',
      by: { name: 'Marie Durand', sameOrganisation: true },
      comment: null,
    },
  ],
}

const plain = (text: string | null | undefined) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

function stubFetch(answer: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('/contracts/list.php')) {
        return Promise.resolve(
          new Response(JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }), { status: 200 }),
        )
      }
      if (url.includes('/anomalies/detail.php')) return Promise.resolve(answer(url))
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
}

const ok = () => new Response(JSON.stringify(detail), { status: 200 })

function Probe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderDetail(entry: string | { pathname: string; state: unknown } = '/alertes/80480-2') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/alertes" element={<p data-testid="list-page">list</p>} />
        <Route path="/alertes/:anomalyKey" element={<ContractTestShell><AlertDetail /></ContractTestShell>} />
        <Route path="/pilotage/:chipId" element={<p>device page</p>} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  )
}

describe('AlertDetail (full page)', () => {
  it('shows the drawer content as a page: header, what happened, readings, treatment, history', async () => {
    stubFetch(ok)
    renderDetail()

    expect(screen.getByRole('heading', { level: 1, name: 'Alerte' })).toHaveClass('sr-only')
    expect(plain((await screen.findByTestId('anomaly-title')).textContent)).toBe('Température 19,5 °C')
    expect(plain(screen.getByTestId('anomaly-excess').textContent)).toBe('+0,5 °C')
    expect(screen.getByTestId('anomaly-status')).toHaveTextContent('En cours')
    expect(screen.getByTestId('anomaly-lifecycle')).toBeInTheDocument()

    const occurrence = screen.getByTestId('alert-occurrence')
    expect(plain(within(occurrence).getByTestId('alert-occurrence-value').textContent)).toContain('19,5 °C')
    expect(plain(within(occurrence).getByTestId('alert-occurrence-threshold').textContent)).toContain('19 °C')
    expect(occurrence).toHaveTextContent('Température >= 19 °C')
    expect(occurrence).not.toHaveTextContent('TH19')
    expect(screen.getByTestId('anomaly-reading-temperature')).toHaveAttribute('data-triggering', 'true')
    expect(screen.getByTestId('anomaly-treatment')).toBeInTheDocument()
    expect(screen.getByTestId('anomaly-history-detected')).toHaveTextContent('Système')

    const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(['Ce qui s\'est passé', 'Relevés au moment de la mesure', 'Traitement', 'Historique', 'Device', 'Lot et palette', 'Lieu', 'Actions rapides'])
  })

  it('lays out a grid-12 body: main column 7/8, side column 5/4', async () => {
    stubFetch(ok)
    renderDetail()
    const main = (await screen.findByTestId('alert-occurrence')).parentElement
    const side = screen.getByTestId('alert-device').parentElement
    expect(main?.parentElement).toHaveClass('grid', 'lg:grid-cols-12')
    expect(main).toHaveClass('lg:col-span-7', 'xl:col-span-8')
    expect(side).toHaveClass('lg:col-span-5', 'xl:col-span-4')
  })

  it('links the device and the quick actions', async () => {
    stubFetch(ok)
    renderDetail()
    expect(await screen.findByTestId('alert-device-link')).toHaveAttribute('href', '/pilotage/cpaldev021')
    expect(screen.getByTestId('alert-action-map')).toHaveAttribute('href', '/pulse?anomalie=80480-2')
    expect(screen.getByTestId('alert-action-pallet')).toHaveAttribute('href', '/pulse?palette=cpaldev021')
    expect(screen.getByTestId('alert-action-readings')).toHaveAttribute('href', '/pilotage/cpaldev021/releves')
    expect(screen.getByTestId('alert-action-device-alerts')).toHaveAttribute('href', '/alertes?device=cpaldev021')
    expect(screen.getByTestId('alert-lot')).toHaveTextContent('Lot client L-100 · Lot cPAL CP-1 · Produit Yaourt')
    expect(plain(screen.getByTestId('anomaly-position').textContent)).toBe('Position 43,48, 5,37')
  })

  it('goes back to the list, keeping the query string it came from', async () => {
    const user = userEvent.setup()
    stubFetch(ok)
    renderDetail({ pathname: '/alertes/80480-2', state: { listSearch: '?statut=all&device=cpaldev021' } })
    await user.click(await screen.findByRole('button', { name: 'Retour à la liste' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/alertes?statut=all&device=cpaldev021')
  })

  it('goes back to the bare list on a direct visit', async () => {
    const user = userEvent.setup()
    stubFetch(ok)
    renderDetail()
    await user.click(await screen.findByRole('button', { name: 'Retour à la liste' }))
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/alertes$/)
    expect(screen.getByTestId('list-page')).toBeInTheDocument()
  })

  it('shows a read-only note instead of the form on a closed alert, and omits absent facts', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({ ...detail, status: 'cloturee', allowedTransitions: [], readOnlyReason: 'cloturee', lot: null, position: null }),
        { status: 200 },
      ),
    )
    renderDetail()
    expect(await screen.findByTestId('anomaly-read-only')).toHaveTextContent('Anomalie clôturée')
    expect(screen.queryByTestId('alert-lot')).not.toBeInTheDocument()
    expect(screen.queryByTestId('alert-place')).not.toBeInTheDocument()
  })

  it('shows a not-found state when the alert is not in this contract', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }))
    renderDetail('/alertes/NOPE')
    const empty = await screen.findByTestId('alert-not-found')
    expect(empty).toHaveTextContent("n'appartient pas à ce contrat")
    expect(within(empty).getByRole('link', { name: 'Retour aux alertes' })).toHaveAttribute('href', '/alertes')
    expect(screen.queryByTestId('alert-page')).not.toBeInTheDocument()
  })

  it('shows an error with a retry on any other failure', async () => {
    const user = userEvent.setup()
    let fail = true
    stubFetch(() => (fail ? new Response('{}', { status: 500 }) : ok()))
    renderDetail()
    const error = await screen.findByTestId('alert-error')
    fail = false
    await user.click(within(error).getByRole('button', { name: 'Réessayer' }))
    await waitFor(() => expect(screen.getByTestId('anomaly-title')).toBeInTheDocument())
  })

  it('shows a skeleton while the alert loads', async () => {
    let release: (response: Response) => void = () => undefined
    const pending = new Promise<Response>((resolve) => {
      release = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/contracts/list.php')) {
          return Promise.resolve(
            new Response(JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }), { status: 200 }),
          )
        }
        return pending
      }),
    )
    renderDetail()
    expect(await screen.findByTestId('alert-loading')).toBeInTheDocument()
    release(ok())
    await screen.findByTestId('anomaly-title')
    expect(screen.queryByTestId('alert-loading')).not.toBeInTheDocument()
  })
})
