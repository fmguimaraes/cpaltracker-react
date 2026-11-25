import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthContext'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { Pulse } from './Pulse'
import { SELECTED_TOGGLE } from '@/ui/patterns/period-control'

/**
 * Pulse's map frame and top-bar controls (replay scrubber, period presets, live chip, pallet selector,
 * viewport). Kept apart from `Pulse.test.tsx` (the drawer's suite) so each has its own stand-in map: this one
 * exposes marker positions, the reveal request and a "zoom" that reports new bounds through `onViewportChange`.
 */

const account = {
  userId: 1, clientId: null, mail: 'demo@cpal.test', nom: 'Demo', prenom: 'User',
  role: 'client', telephone: null, lastLoginAt: null, mustChangePassword: false,
}

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))
vi.mock('@/ui/map', async (importOriginal) => {
  const { Button } = await import('@/ui/button')
  return {
    ...(await importOriginal<typeof import('@/ui/map')>()),
    FleetMap: ({ devices, selectedId, onSelect, onViewportChange, reveal, fitRequest, fitControl, markerStyle, trails }: {
      devices: Array<{ id: string; lat: number; lng: number }>
      selectedId?: string | null
      onSelect?: (id: string) => void
      onViewportChange?: (viewport: { north: number; south: number; east: number; west: number }) => void
      reveal?: { id: string; tick: number; minZoom?: number } | null
      fitRequest?: number
      fitControl?: { label?: string; tooltip?: string; disabled?: boolean }
      markerStyle?: string
      trails?: Array<{ id: string; points: Array<[number, number]> }>
    }) => (
      <div
        data-testid="map"
        data-fit-request={fitRequest ?? 0}
        data-marker-style={markerStyle ?? 'pill'}
        data-trails={JSON.stringify(trails ?? [])}
      >
        {fitControl && (
          <Button data-testid="map-overview" aria-label={fitControl.label} title={fitControl.tooltip} disabled={fitControl.disabled}>
            fit
          </Button>
        )}
        {devices.map((d) => (
          <Button
            key={d.id}
            data-testid={`marker-${d.id}`}
            data-pos={`${d.lat},${d.lng}`}
            data-selected={d.id === selectedId}
            onClick={() => onSelect?.(d.id)}
          >
            {d.id}
          </Button>
        ))}
        {reveal && <span data-testid="map-reveal">{`${reveal.id}@${reveal.tick}${reveal.minZoom ? ` z>=${reveal.minZoom}` : ''}`}</span>}
        {/* A zoom onto Paris (CHIP-A/B) leaves CHIP-C (Marseille) out of view. */}
        <Button data-testid="map-zoom-paris" onClick={() => onViewportChange?.({ north: 49, south: 48.5, east: 2.6, west: 2 })}>
          zoom
        </Button>
      </div>
    ),
  }
})
vi.mock('../anomalies/ContractAnomalies', async () => {
  const { Button } = await import('@/ui/button')
  return {
    ContractAnomalies: ({ chipId, visibleChipIds, mapChipIds, onShowAll }: {
      chipId?: string
      visibleChipIds?: ReadonlySet<string>
      mapChipIds?: ReadonlySet<string>
      onShowAll?: () => void
    }) => (
      <Button
        data-testid={`anomalies-${chipId ?? 'contract'}`}
        data-visible={visibleChipIds ? [...visibleChipIds].sort().join(',') : 'none'}
        data-on-map={mapChipIds ? [...mapChipIds].sort().join(',') : 'none'}
        onClick={onShowAll}
      >
        anomalies
      </Button>
    ),
  }
})
vi.mock('../anomalies/AnomalyDetailView', () => ({
  AnomalyDetailView: ({ anomalyKey }: { anomalyKey: string }) => <div data-testid="anomaly-detail-view">{anomalyKey}</div>,
}))
vi.mock('../pulse/PalletPanel', async () => {
  const { Button } = await import('@/ui/button')
  return {
  PalletPanel: ({ position, range, onShowAnomalies }: { position: { chipId: string }; range: { from: Date; to: Date }; onShowAnomalies?: () => void }) => (
    <div data-testid="pallet-panel" data-days={Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000)}>
      {position.chipId}
      <Button data-testid="pallet-anomalies-link" onClick={onShowAnomalies}>
        anomalies
      </Button>
    </div>
  ),
}
})

const DAY = 86_400_000
const HOUR = 3_600_000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString()
/** The API's UTC wall-clock text ('YYYY-MM-DD HH:MM:SS'). */
const utcText = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
const anomaly = (anomalyKey: string, chipId: string, eventMs: number) => ({
  anomalyKey, status: 'detectee', code: 'TEMP_MAX', label: 'Température max', threshold: 25, value: 31, excess: 6, unit: '°C',
  eventDate: utcText(eventMs), detectedAt: utcText(eventMs), chipId, lot: null,
})
const position = (chipId: string, lot: object | null, timestamp: string, latitude: number, longitude: number) => ({
  contractId: 12, chipId, timestamp, latitude, longitude,
  ambientTemperature: 20, humidity: 50, mass: 320, mpuTemperature: 21, accelG: 1, lot,
})
const lot = (cpalLot: string, custLotNumber: string) => ({
  cpalLot, custLotNumber, productName: 'Doliprane', expiryDate: '2027-05-31', status: 'created',
})
// CHIP-A moved from Lyon (2 days ago) to Grenoble (1 day ago); the other pallets have no history.
const row = (c: string, t: number, la: number, lo: number) => ({
  c, t, ts: new Date(t).toISOString(), p: 1, la, lo, ta: 20, hr: 50, m: 320, g: 1, tm: 21,
})
const history = () => ({
  contract: { ContratID: 12, ContratRef: 'REF-012', ContratType: 'MAIN', ClientID: null, DebutContrat: null, FinContrat: null },
  devices: [],
  rows: [row('CHIP-A', Date.now() - 2 * DAY, 45.76, 4.83), row('CHIP-A', Date.now() - DAY, 45.19, 5.72)],
  hooks: [],
  count: 2,
  total: 2,
  sampled: false,
  summaries: { ta: null, hr: null, m: null },
})

let historyCalls = 0
let anomalyRows: unknown[] = []
let pulsePositions: () => unknown[]
const defaultPulsePositions = () => [
  position('CHIP-A', lot('LOT-A', 'L-001'), daysAgo(0.5), 48.8, 2.3),
  position('CHIP-B', lot('LOT-B', 'L-002'), daysAgo(0.5), 48.9, 2.4),
  position('CHIP-C', null, daysAgo(10), 43.3, 5.4),
]

beforeEach(() => {
  historyCalls = 0
  anomalyRows = []
  pulsePositions = defaultPulsePositions
  window.sessionStorage.clear()
  window.localStorage.clear()
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
          positions: pulsePositions(),
        })
      if (url.includes('/contracts/history.php/12')) {
        historyCalls += 1
        return json(history())
      }
      if (url.includes('/messages/contract.php')) return json({ message: null })
      if (url.includes('/anomalies/')) return json({ anomalies: anomalyRows })
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

describe('Pulse map frame and top-bar controls', () => {
  it('top bar: exactly the pallets and the freshness chip; the timeline bar is docked under the map, live', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    const controls = screen.getByTestId('pulse-controls')
    expect(Array.from(controls.children).map((el) => el.getAttribute('data-testid'))).toEqual(['pulse-pallets', 'pulse-freshness'])
    expect(within(controls).getByTestId('pulse-pallets')).toHaveTextContent('Palettes 3/3')
    // Live: "● En direct · HH:MM" with the refresh icon inside; the date and time of the update in the tooltip.
    const chip = within(controls).getByTestId('pulse-freshness')
    expect(chip).toHaveAttribute('data-mode', 'live')
    expect(chip).toHaveTextContent(/^En direct · \d{2}:\d{2}$/)
    expect(chip).toHaveAttribute('title', expect.stringMatching(/^Dernière mise à jour \d{1,2}\s\S+\s\d{2}:\d{2}$/))
    expect(within(chip).getByRole('button', { name: 'Rafraîchir' })).toBeEnabled()
    expect(within(controls).queryByTestId('pulse-period')).not.toBeInTheDocument()
    expect(screen.queryByTestId('positions-refresh')).not.toBeInTheDocument()

    // The timeline bar: in the map column, after the map; play, period, track, position, speeds.
    const bar = screen.getByTestId('pulse-timeline')
    expect(screen.getByTestId('pulse-map-column').lastElementChild).toBe(bar)
    expect(bar).toHaveAttribute('data-mode', 'live')
    expect(bar).toHaveClass('h-12', 'border-t')
    expect(bar).not.toHaveClass('absolute')
    expect(within(bar).getByRole('button', { name: 'Lecture' })).toBeInTheDocument()
    expect(within(bar).getByTestId('pulse-period-30d')).toHaveAttribute('data-state', 'on')
    expect(within(bar).getByRole('button', { name: 'Période personnalisée' })).toBeInTheDocument()
    expect(within(bar).getByRole('slider', { name: 'Instant de lecture' })).toHaveAttribute('aria-valuetext', 'En direct')
    expect(within(bar).getByTestId('pulse-instant')).toHaveTextContent('En direct')
    expect(within(bar).queryByTestId('pulse-go-live')).not.toBeInTheDocument()
    expect(within(bar).getByTestId('pulse-speed-1')).toBeDisabled()
    expect(screen.queryByTestId('pulse-replay')).not.toBeInTheDocument()
    // Pulse-only compact markers.
    expect(screen.getByTestId('map')).toHaveAttribute('data-marker-style', 'compact')
    // Live needs no history.
    expect(historyCalls).toBe(0)
  })

  it('▶ enters replay at the period start: same bar, the instant and "Revenir au direct"; the chip reads "Rejeu ·" and ✕ goes back live', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    const bar = screen.getByTestId('pulse-timeline')
    const before = bar.className
    await userEvent.click(within(bar).getByRole('button', { name: 'Lecture' }))

    expect(bar).toHaveAttribute('data-mode', 'replay')
    // No layout change between live and replay: the same bar, same classes.
    expect(screen.getByTestId('pulse-timeline')).toBe(bar)
    expect(bar.className).toBe(before)
    expect(within(bar).getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(within(bar).getByTestId('pulse-speed-1')).toBeEnabled()
    expect(within(bar).getByTestId('pulse-speed-1')).toHaveAttribute('data-state', 'on')
    expect(within(bar).getByTestId('pulse-speed-12')).toHaveTextContent('×12')
    // French local instant ("15 nov. 11:00"), never ISO.
    expect(within(bar).getByTestId('pulse-instant').textContent).toMatch(/^\d{1,2}\s\S+\s\d{2}:\d{2}$/)
    expect(within(bar).getByTestId('pulse-go-live')).toHaveTextContent('Revenir au direct')
    const chip = screen.getByTestId('pulse-freshness')
    expect(chip).toHaveAttribute('data-mode', 'replay')
    expect(chip).toHaveTextContent(/^Rejeu · \d{1,2}\s\S+\s\d{2}:\d{2}$/)
    expect(screen.queryByTestId('pulse-freshness-dot')).not.toBeInTheDocument()
    expect(historyCalls).toBe(1)

    await userEvent.click(within(chip).getByRole('button', { name: 'Revenir au direct' }))
    expect(bar).toHaveAttribute('data-mode', 'live')
    expect(screen.getByTestId('pulse-freshness')).toHaveTextContent(/^En direct/)

    // The bar's own "Revenir au direct" too.
    await userEvent.click(within(bar).getByRole('button', { name: 'Lecture' }))
    await userEvent.click(within(bar).getByTestId('pulse-go-live'))
    expect(bar).toHaveAttribute('data-mode', 'live')
  })

  it('the freshness chip refreshes in place: the icon spins, then a failure turns the dot to warning', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    let release: (() => void) | undefined
    const fetchMock = vi.mocked(fetch)
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((input) =>
      input.toString().includes('/contracts/pulse.php/12')
        ? new Promise<Response>((_, reject) => {
            release = () => reject(new Error('offline'))
          })
        : original(input),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Rafraîchir' }))
    const chip = screen.getByTestId('pulse-freshness')
    expect(chip).toHaveAttribute('data-state', 'refreshing')
    expect(within(chip).getByRole('button', { name: 'Rafraîchir' }).querySelector('svg')).toHaveClass('animate-spin')
    release!()
    await waitFor(() => expect(chip).toHaveAttribute('data-state', 'error'))
    expect(screen.getByTestId('pulse-freshness-dot')).toHaveClass('bg-warning')
    expect(chip).toHaveAttribute('title', 'Échec de la mise à jour · réessayer')
    // The map keeps the last known positions; no extra alert above it.
    expect(screen.getByTestId('marker-CHIP-A')).toBeInTheDocument()
    expect(screen.queryByTestId('positions-refresh-error')).not.toBeInTheDocument()
  })

  it('keyboard on the timeline: Space plays/pauses, ←/→ step, End goes back live; never in a text field', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    const slider = screen.getByRole('slider', { name: 'Instant de lecture' })
    slider.focus()
    await userEvent.keyboard(' ')
    expect(screen.getByTestId('pulse-timeline')).toHaveAttribute('data-mode', 'replay')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    await userEvent.keyboard(' ')
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument()
    const at = () => Number(screen.getByRole('slider', { name: 'Instant de lecture' }).getAttribute('aria-valuenow'))
    const start = at()
    await userEvent.keyboard('{ArrowRight}')
    // One step = 1 % of the 30-day period.
    expect(at() - start).toBe(Math.round(0.3 * 86_400_000))
    await userEvent.keyboard('{ArrowLeft}')
    expect(at()).toBe(start)
    await userEvent.keyboard('{End}')
    expect(screen.getByTestId('pulse-timeline')).toHaveAttribute('data-mode', 'live')

    // In the pallet search, Space is a character.
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    const search = await screen.findByRole('searchbox', { name: 'Rechercher une palette' })
    await userEvent.type(search, 'a b')
    expect(search).toHaveValue('a b')
    expect(screen.getByTestId('pulse-timeline')).toHaveAttribute('data-mode', 'live')
  })

  it('the pallet selector: fleet summary, search, select all / none, hide/show and "Localiser"', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    const popover = await screen.findByTestId('pulse-pallets-popover')
    // Opening focuses the search (not the lot filter or the first checkbox); one focus ring, the group's.
    const search = within(popover).getByRole('searchbox', { name: 'Rechercher une palette' })
    await waitFor(() => expect(search).toHaveFocus())
    expect(search).toHaveClass('focus-visible:outline-none!')
    // Suivi en direct's fleet status line (mass 320 kg is "Avertissement").
    expect(within(popover).getByTestId('pulse-fleet-summary')).toHaveTextContent('3 palettes · 3 Avertissement')
    expect(within(popover).getByTestId('pulse-pallet-status-CHIP-A')).toHaveAttribute('data-status', 'warning')
    expect(within(popover).getByTestId('pulse-pallet-row-CHIP-A')).toHaveTextContent('il y a 12 h')

    // Unchecking hides the pallet from the map and from the anomaly scope.
    await userEvent.click(within(popover).getByTestId('pulse-pallet-check-CHIP-B'))
    expect(screen.queryByTestId('marker-CHIP-B')).not.toBeInTheDocument()
    expect(screen.getByTestId('anomalies-contract')).toHaveAttribute('data-visible', 'CHIP-A,CHIP-C')
    expect(screen.getByTestId('anomalies-contract')).toHaveAttribute('data-on-map', 'CHIP-A,CHIP-C')
    expect(screen.getByTestId('pulse-pallets')).toHaveTextContent('Palettes 2/3')

    // Search narrows the rows; "Aucune" / "Tout sélectionner" act on them.
    await userEvent.type(within(popover).getByRole('searchbox', { name: 'Rechercher une palette' }), 'chip-c')
    expect(within(popover).queryByTestId('pulse-pallet-row-CHIP-A')).not.toBeInTheDocument()
    expect(within(popover).getByTestId('pulse-pallet-row-CHIP-C')).toBeInTheDocument()
    await userEvent.click(within(popover).getByTestId('pulse-pallets-none'))
    expect(screen.queryByTestId('marker-CHIP-C')).not.toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-A')).toBeInTheDocument()
    expect(screen.getByTestId('pulse-pallets')).toHaveTextContent('Palettes 1/3')
    await userEvent.clear(within(popover).getByRole('searchbox', { name: 'Rechercher une palette' }))
    await userEvent.click(within(popover).getByTestId('pulse-pallets-all'))
    expect(screen.getByTestId('pulse-pallets')).toHaveTextContent('Palettes 3/3')
    expect(screen.getByTestId('marker-CHIP-B')).toBeInTheDocument()

    // ⌖ Localiser: flies there and opens the pallet's drawer.
    await userEvent.click(within(popover).getByTestId('pulse-pallet-locate-CHIP-C'))
    expect(screen.getByTestId('map-reveal')).toHaveTextContent('CHIP-C@1 z>=10')
    expect(screen.getByTestId('pallet-panel')).toHaveTextContent('CHIP-C')
    expect(screen.getByTestId('marker-CHIP-C')).toHaveAttribute('data-selected', 'true')
  })

  it('"Localiser" on a hidden pallet shows it again; a pallet without a position cannot be located', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    const popover = await screen.findByTestId('pulse-pallets-popover')
    await userEvent.click(within(popover).getByTestId('pulse-pallet-check-CHIP-A'))
    expect(screen.queryByTestId('marker-CHIP-A')).not.toBeInTheDocument()
    await userEvent.click(within(popover).getByTestId('pulse-pallet-locate-CHIP-A'))
    expect(screen.getByTestId('marker-CHIP-A')).toBeInTheDocument()
    expect(screen.getByTestId('pallet-panel')).toHaveTextContent('CHIP-A')

    // Out of the 7 j period, CHIP-C has no position to fly to.
    await userEvent.click(screen.getByTestId('pulse-period-7d'))
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    expect(await screen.findByTestId('pulse-pallet-locate-CHIP-C')).toBeDisabled()
  })

  it('the contract anomalies follow the map viewport; "Localiser" brings an out-of-view pallet back', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('anomalies-contract')).toHaveAttribute('data-visible', 'CHIP-A,CHIP-B,CHIP-C')

    await userEvent.click(screen.getByTestId('map-zoom-paris'))
    expect(screen.getByTestId('anomalies-contract')).toHaveAttribute('data-visible', 'CHIP-A,CHIP-B')
    expect(screen.getByTestId('anomalies-contract')).toHaveAttribute('data-on-map', 'CHIP-A,CHIP-B,CHIP-C')
    expect(screen.getByTestId('marker-CHIP-C')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pulse-pallets'))
    await userEvent.click(await screen.findByTestId('pulse-pallet-locate-CHIP-C'))
    expect(screen.getByTestId('map-reveal')).toHaveTextContent('CHIP-C@1 z>=10')
  })

  it('"Vue d’ensemble" is disabled while every pallet is in view; it and "Tout afficher" re-frame the map', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    const overview = screen.getByTestId('map-overview')
    expect(overview).toHaveAccessibleName('Vue d’ensemble')
    expect(overview).toHaveAttribute('title', 'Vue d’ensemble')
    expect(overview).toBeDisabled()

    await userEvent.click(screen.getByTestId('map-zoom-paris'))
    expect(overview).toBeEnabled()

    // The panel's "Tout afficher" (the mocked list calls `onShowAll`) asks the map to fit every pallet.
    expect(screen.getByTestId('map')).toHaveAttribute('data-fit-request', '0')
    await userEvent.click(screen.getByTestId('anomalies-contract'))
    expect(screen.getByTestId('map')).toHaveAttribute('data-fit-request', '1')

    // Out of the period, CHIP-C is off the map: the two Paris pallets are all in view again.
    await userEvent.click(screen.getByTestId('pulse-period-7d'))
    expect(overview).toBeDisabled()
  })

  it('the pallet’s anomalies (drawer filtered on it) are not narrowed by the viewport', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('marker-CHIP-A'))
    await userEvent.click(screen.getByTestId('pallet-anomalies-link'))
    expect(screen.getByTestId('anomalies-CHIP-A')).toHaveAttribute('data-visible', 'none')
  })

  it('moving the handle enters replay: the pallets at that instant; back to live returns to the snapshot', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-pos', '48.8,2.3')

    // Live, the handle is pinned at the end; Home moves it to the period start (replay, paused).
    screen.getByRole('slider', { name: 'Instant de lecture' }).focus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByTestId('pulse-timeline')).toHaveAttribute('data-mode', 'replay')
    // At the start of the period no pallet has a position yet.
    await waitFor(() => expect(screen.queryByTestId('marker-CHIP-A')).not.toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument()

    // Back live (End), then one step back from the end: CHIP-A at its last history point.
    await userEvent.keyboard('{End}{ArrowLeft}')
    await waitFor(() => expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-pos', '45.19,5.72'), { timeout: 5000 })
    expect(screen.queryByTestId('marker-CHIP-B')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pulse-go-live'))
    expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-pos', '48.8,2.3')
    expect(screen.getByTestId('marker-CHIP-B')).toBeInTheDocument()
  })

  it('changing the period keeps the mode: live stays live, replay stays in replay inside the new range', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('pulse-period-7d'))
    expect(screen.getByTestId('pulse-timeline')).toHaveAttribute('data-mode', 'live')

    await userEvent.click(screen.getByTestId('pulse-period-30d'))
    screen.getByRole('slider', { name: 'Instant de lecture' }).focus()
    await userEvent.keyboard('{Home}')
    await userEvent.click(screen.getByTestId('pulse-period-7d'))
    const bar = screen.getByTestId('pulse-timeline')
    expect(bar).toHaveAttribute('data-mode', 'replay')
    const slider = within(bar).getByRole('slider', { name: 'Instant de lecture' })
    expect(Number(slider.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(Number(slider.getAttribute('aria-valuemin')))
  })

  it('▶ plays the period from its start, at the chosen speed, and stops at the end', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    screen.getByRole('slider', { name: 'Instant de lecture' }).focus()
    await userEvent.keyboard('{Home}')
    await waitFor(() => expect(screen.queryByTestId('marker-CHIP-A')).not.toBeInTheDocument(), { timeout: 5000 })
    await userEvent.click(screen.getByTestId('pulse-speed-12'))
    await userEvent.click(screen.getByRole('button', { name: 'Lecture' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    // ×12 covers the period in ~1.3 s: CHIP-A appears at Lyon, then Grenoble, and playback stops at the end.
    await waitFor(() => expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-pos', '45.19,5.72'), { timeout: 5000 })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument(), { timeout: 5000 })
  })

  it('anomaly ticks sit on the track; a click jumps there and opens the anomaly', async () => {
    // An hour after CHIP-A's Lyon reading.
    anomalyRows = [anomaly('ANO-1', 'CHIP-A', Date.now() - 2 * DAY + HOUR), anomaly('ANO-OLD', 'CHIP-A', Date.now() - 40 * DAY)]
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    // The ticks are on the track live too.
    const tick = await screen.findByTestId('pulse-tick-ANO-1', {}, { timeout: 5000 })
    // Outside the 30 j period: no tick.
    expect(screen.queryByTestId('pulse-tick-ANO-OLD')).not.toBeInTheDocument()
    expect(tick).toHaveAttribute('title', expect.stringMatching(/^Température max 31\s°C · CHIP-A · \d{1,2}\s\S+\s\d{2}:\d{2}$/))
    expect(tick).toHaveClass('bg-danger')
    // Placed at its share of the period (~28 of 30 days).
    expect(Number.parseFloat(tick.parentElement!.style.left)).toBeCloseTo((28 / 30) * 100, 0)

    await userEvent.click(tick)
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-1')
    expect(screen.getByTestId('map-reveal')).toHaveTextContent('CHIP-A@1')
    expect(screen.getByRole('button', { name: 'Lecture' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-pos', '45.76,4.83'), { timeout: 5000 })
  })

  it('a hidden pallet’s anomalies get no tick', async () => {
    anomalyRows = [anomaly('ANO-1', 'CHIP-A', Date.now() - 2 * DAY)]
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await screen.findByTestId('pulse-tick-ANO-1', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    await userEvent.click(await screen.findByTestId('pulse-pallet-check-CHIP-A'))
    expect(screen.queryByTestId('pulse-tick-ANO-1')).not.toBeInTheDocument()
  })

  it('a period with no position keeps the map, with a message centred on it; the 1 j preset stays selected', async () => {
    // Every pallet last reported more than a day ago: "1j" leaves nothing on the map.
    pulsePositions = () => [
      position('CHIP-A', lot('LOT-A', 'L-001'), daysAgo(3), 48.8, 2.3),
      position('CHIP-C', null, daysAgo(10), 43.3, 5.4),
    ]
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.queryByTestId('positions-period-empty')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pulse-period-24h'))
    const notice = screen.getByTestId('positions-period-empty')
    expect(notice).toHaveTextContent("Aucun appareil n'a émis de position sur cette période.")
    expect(notice).toHaveAttribute('data-overlay', 'map')
    expect(notice).toHaveClass('inset-0', 'items-center', 'justify-center')
    // The map stays mounted (no marker), with its controls.
    expect(screen.getByTestId('map')).toBeInTheDocument()
    expect(screen.getByTestId('map-overview')).toBeDisabled()
    expect(screen.queryByTestId('marker-CHIP-A')).not.toBeInTheDocument()

    // The choice holds, and reads as selected (the shared selected-segment style).
    const oneDay = screen.getByTestId('pulse-period-24h')
    expect(oneDay).toHaveAttribute('data-state', 'on')
    expect(oneDay).toHaveClass(...SELECTED_TOGGLE.split(' '))
    for (const p of ['7d', '15d', '30d']) expect(screen.getByTestId(`pulse-period-${p}`)).toHaveAttribute('data-state', 'off')
    await userEvent.unhover(oneDay)
    expect(oneDay).toHaveAttribute('data-state', 'on')

    // Back to a period with pallets: the notice goes, the markers come back.
    await userEvent.click(screen.getByTestId('pulse-period-7d'))
    expect(screen.queryByTestId('positions-period-empty')).not.toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-A')).toBeInTheDocument()
  })

  it('a contract with no position at all keeps the map with its notice', async () => {
    pulsePositions = () => []
    renderPulse()
    const notice = await screen.findByTestId('positions-empty', {}, { timeout: 5000 })
    expect(notice).toHaveTextContent('Aucune position disponible pour ce contrat.')
    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('playback draws each pallet’s trail up to the instant; none live', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(JSON.parse(screen.getByTestId('map').dataset.trails!)).toEqual([])

    screen.getByRole('slider', { name: 'Instant de lecture' }).focus()
    await userEvent.keyboard('{Home}')
    await waitFor(() => expect(screen.queryByTestId('marker-CHIP-A')).not.toBeInTheDocument(), { timeout: 5000 })
    // At the start of the period nothing has moved yet.
    expect(JSON.parse(screen.getByTestId('map').dataset.trails!)).toEqual([])

    await userEvent.keyboard('{End}{ArrowLeft}')
    await waitFor(() => expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-pos', '45.19,5.72'), { timeout: 5000 })
    // Lyon then Grenoble, ending on the marker; CHIP-B/C have no history, so no trail.
    expect(JSON.parse(screen.getByTestId('map').dataset.trails!)).toEqual([{ id: 'CHIP-A', points: [[45.76, 4.83], [45.19, 5.72]] }])

    // The lot filter (in the pallet selector) narrows the trails with the pallets.
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    await userEvent.click(await screen.findByTestId('pulse-lot-filter'))
    await userEvent.click(await screen.findByTestId('pulse-lot-option-LOT-B'))
    await waitFor(() => expect(screen.queryByTestId('marker-CHIP-A')).not.toBeInTheDocument())
    expect(JSON.parse(screen.getByTestId('map').dataset.trails!)).toEqual([])

    await userEvent.click(screen.getByTestId('pulse-go-live'))
    expect(JSON.parse(screen.getByTestId('map').dataset.trails!)).toEqual([])
  })

  it('every pallet unchecked: "Aucune palette sélectionnée" on the map, with "Tout sélectionner"', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    await userEvent.click(await screen.findByTestId('pulse-pallets-none'))
    await userEvent.keyboard('{Escape}')
    const notice = screen.getByTestId('positions-notice')
    expect(notice).toHaveTextContent('Aucune palette sélectionnée')
    expect(notice).not.toHaveTextContent("Aucun appareil n'a émis")
    await userEvent.click(within(notice).getByRole('button', { name: 'Tout sélectionner' }))
    expect(screen.getByTestId('marker-CHIP-A')).toBeInTheDocument()
    expect(screen.queryByTestId('positions-notice')).not.toBeInTheDocument()
  })
})
