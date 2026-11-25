import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { DevicePilotage } from './DevicePilotage'
import { DeviceReadings } from './DeviceReadings'
import { PilotageDeviceDetail } from './PilotageDeviceDetail'

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({
  default: () => () => <div data-testid="mock-plot" />,
}))

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
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => undefined
  Element.prototype.scrollIntoView ??= () => undefined
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function historyRow(overrides: Record<string, unknown>) {
  return { c: 'CHIP-001', t: 0, ts: '', p: 0, la: null, lo: null, ta: null, hr: null, m: null, g: null, tm: null, ...overrides }
}

const T0 = Date.UTC(2026, 10, 20, 8, 0, 0)
const HISTORY_ROWS = [
  historyRow({ t: T0, ta: 18, hr: 50, m: 420, g: 1, p: 1, la: 48.8566, lo: 2.3522 }),
  historyRow({ t: T0 + 3_600_000, ta: 22.5, hr: 55, m: 418, g: 3.2 }),
  historyRow({ t: T0 + 7_200_000, ta: 20, hr: 52 }),
  // Another chip, and a row with no measure at all: neither is listed.
  historyRow({ c: 'CHIP-002', t: T0 + 1000, ta: 99 }),
  historyRow({ t: T0 + 9_000_000 }),
]

function stubFetch(history: Response | (() => Response | Promise<Response>) = () => json({ rows: HISTORY_ROWS, count: 5, total: 5, sampled: false })) {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      urls.push(url)
      if (url.includes('/contracts/list.php'))
        return Promise.resolve(json({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }))
      if (url.includes('/devices/positions.php'))
        return Promise.resolve(
          json({
            positions: ['CHIP-001', 'CHIP-002'].map((chipId) => ({
              contractId: 12, chipId, timestamp: '2026-10-10T08:00:05Z', latitude: 48.8, longitude: 2.3,
              ambientTemperature: 19, humidity: 55, mass: 420, mpuTemperature: 21, accelG: 1,
            })),
          }),
        )
      if (url.includes('/contracts/history.php')) return Promise.resolve(typeof history === 'function' ? history() : history.clone()).then((r) => r.clone())
      if (url.includes('/anomalies/list.php')) return Promise.resolve(json({ anomalies: [] }))
      if (url.includes('/devices/config.php')) return Promise.resolve(json({ deviceId: 'CHIP-001', contractId: 12, reglageId: 1, updatedAt: null, config: {} }))
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
  return urls
}

function Probe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderReadings(entry = '/pilotage/CHIP-001/releves') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/pilotage" element={<ContractTestShell><DevicePilotage /></ContractTestShell>}>
          <Route path=":chipId" element={<PilotageDeviceDetail />} />
          <Route path=":chipId/releves" element={<DeviceReadings />} />
        </Route>
      </Routes>
      <Probe />
    </MemoryRouter>,
  )
}

describe('DeviceReadings', () => {
  it('lists only this chip’s readings, newest first, with dashes for missing measures', async () => {
    stubFetch()
    renderReadings()
    const list = await screen.findByTestId('device-readings-list')
    const rows = within(list).getAllByTestId(/^device-reading-/)
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      `device-reading-${T0 + 7_200_000}`,
      `device-reading-${T0 + 3_600_000}`,
      `device-reading-${T0}`,
    ])
    expect(rows[1]).toHaveTextContent('22,5')
    expect(rows[2]).toHaveTextContent('48,8566, 2,3522')
    expect(rows[0]).toHaveTextContent('—')
    expect(screen.getByTestId('device-readings-count')).toHaveTextContent('3 relevés')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Relevés · CHIP-001')
  })

  it('requests the contract history for a 7-day range by default, then the shared presets re-fetch', async () => {
    const urls = stubFetch()
    renderReadings()
    await screen.findByTestId('device-readings-list')
    const first = urls.filter((url) => url.includes('/contracts/history.php/12'))
    expect(first).toHaveLength(1)
    const params = new URL(first[0], 'http://x').searchParams
    const days = (Date.parse(params.get('end')!) - Date.parse(params.get('start')!)) / 86_400_000
    expect(days).toBe(7)

    await userEvent.click(screen.getByTestId('time-30d'))
    await waitFor(() => expect(urls.filter((url) => url.includes('/contracts/history.php/12'))).toHaveLength(2))
    const second = new URL(urls.filter((url) => url.includes('/contracts/history.php/12'))[1], 'http://x').searchParams
    expect((Date.parse(second.get('end')!) - Date.parse(second.get('start')!)) / 86_400_000).toBe(30)
  })

  it('summarises min / max / last per measure over the range', async () => {
    stubFetch()
    renderReadings()
    const temperature = await screen.findByTestId('device-readings-summary-ta')
    // last = the newest reading carrying the measure (20 °C), min 18, max 22,5.
    expect(temperature).toHaveTextContent('20 °C')
    expect(temperature).toHaveTextContent('min 18 · max 22,5')
    // The newest mass is the 418 kg reading.
    expect(screen.getByTestId('device-readings-summary-m')).toHaveTextContent('418 kg')
    expect(screen.getByTestId('device-readings-chart')).toBeInTheDocument()
  })

  it('shows an empty state when the range has no reading for the chip', async () => {
    stubFetch(json({ rows: [HISTORY_ROWS[3]], count: 1, total: 1, sampled: false }))
    renderReadings()
    expect(await screen.findByTestId('device-readings-empty')).toHaveTextContent('Aucun relevé')
    expect(screen.queryByTestId('device-readings-list')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when the history cannot be loaded', async () => {
    let fail = true
    stubFetch(() => (fail ? json({ error: { code: 'service_unavailable', message: 'DB is down' } }, 503) : json({ rows: HISTORY_ROWS, count: 5, total: 5, sampled: false })))
    renderReadings()
    const error = await screen.findByTestId('device-readings-error')
    expect(error).not.toHaveTextContent('DB is down')
    fail = false
    await userEvent.click(screen.getByTestId('device-readings-retry'))
    expect(await screen.findByTestId('device-readings-list')).toBeInTheDocument()
  })

  it('shows a loading skeleton while the history is fetched', async () => {
    let release: (response: Response) => void = () => undefined
    stubFetch(() => new Promise<Response>((resolve) => (release = resolve)))
    renderReadings()
    expect(await screen.findByTestId('device-readings-loading')).toBeInTheDocument()
    release(json({ rows: HISTORY_ROWS, count: 5, total: 5, sampled: false }))
    await screen.findByTestId('device-readings-list')
    expect(screen.queryByTestId('device-readings-loading')).not.toBeInTheDocument()
  })

  it('breadcrumb is "Pilotage › CHIP › Relevés", the chip level links back, and so does the back button', async () => {
    stubFetch()
    renderReadings()
    await screen.findByTestId('device-readings-page')
    expect(screen.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pilotage › CHIP-001 › Relevés')
    await userEvent.click(screen.getByTestId('breadcrumb-device'))
    expect(await screen.findByTestId('pilotage-device-page')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/pilotage\/CHIP-001$/)
    await userEvent.click(screen.getByTestId('pilotage-device-readings-all'))
    await userEvent.click(await screen.findByTestId('device-readings-back'))
    expect(await screen.findByTestId('pilotage-device-page')).toBeInTheDocument()
    expect(screen.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pilotage › CHIP-001')
  })

  it('renders cards instead of the table below md', async () => {
    stubViewport(true)
    stubFetch()
    renderReadings()
    const list = await screen.findByTestId('device-readings-list')
    expect(list.tagName).toBe('UL')
    expect(within(list).getAllByTestId(/^device-reading-/)).toHaveLength(3)
  })

  it('a device that is not on this contract shows the not-found state', async () => {
    stubFetch()
    renderReadings('/pilotage/CHIP-404/releves')
    expect(await screen.findByTestId('pilotage-device-not-found')).toBeInTheDocument()
  })
})
