import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from '@/ui/button'
import { AuthProvider } from '../auth/AuthContext'
import { ContractTestShell } from '../contracts/ContractTestShell'
import { Pulse } from './Pulse'

const account = {
  userId: 1, clientId: null, mail: 'demo@cpal.test', nom: 'Demo', prenom: 'User',
  role: 'client', telephone: null, lastLoginAt: null, mustChangePassword: false,
}

vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => () => <div data-testid="mock-plot" /> }))
// jsdom has no layout: stand-in map rendering one clickable marker per device, the selection and the focus point.
vi.mock('@/ui/map', async (importOriginal) => {
  const { Button } = await import('@/ui/button')
  return {
    ...(await importOriginal<typeof import('@/ui/map')>()),
  FleetMap: ({ devices, selectedId, onSelect, track, highlightedId, reveal, layersExtra }: {
    devices: Array<{ id: string }>
    selectedId?: string | null
    onSelect?: (id: string) => void
    track?: { points: Array<{ lat: number; lng: number }>; fitTick: number }
    highlightedId?: string | null
    reveal?: { id: string; tick: number } | null
    layersExtra?: ReactNode
  }) => (
    <div>
      {/* The real kit renders `layersExtra` inside its layers (⧉) popover (see FleetMap.layers.test). */}
      <div data-testid="map-layers">{layersExtra}</div>
      {reveal && <span data-testid="map-reveal">{`${reveal.id}@${reveal.tick}`}</span>}
      {devices.map((d) => (
        <Button
          key={d.id}
          data-testid={`marker-${d.id}`}
          data-selected={d.id === selectedId}
          data-highlighted={d.id === highlightedId}
          onClick={() => onSelect?.(d.id)}
        >
          {d.id}
        </Button>
      ))}
      {track && <span data-testid="map-focus">{`${track.points[0].lat},${track.points[0].lng}@${track.fitTick}`}</span>}
    </div>
  ),
}
})
// The panel's children have their own tests: stand-ins expose just the props Pulse drives.
vi.mock('../anomalies/ContractAnomalies', async () => {
  const { Button } = await import('@/ui/button')
  return {
  ContractAnomalies: ({ chipId, onOpen, onSelect, onHover, selectedKey }: {
    chipId?: string
    onOpen: (key: string) => void
    onSelect?: (row: { anomalyKey: string; chipId: string }) => void
    onHover?: (chipId: string | null) => void
    selectedKey?: string | null
  }) => (
    <div data-selected-key={selectedKey ?? ''} data-testid={`anomalies-list-${chipId ?? 'contract'}`}>
      <Button data-testid={`anomalies-${chipId ?? 'contract'}`} onClick={() => onOpen(`ANO-${chipId ?? 'contract'}`)}>
        ouvrir
      </Button>
      <Button
        data-testid={`anomalies-select-${chipId ?? 'contract'}`}
        onClick={() => onSelect?.({ anomalyKey: 'ANO-B', chipId: chipId ?? 'CHIP-B' })}
        onMouseEnter={() => onHover?.(chipId ?? 'CHIP-B')}
        onMouseLeave={() => onHover?.(null)}
      >
        choisir
      </Button>
    </div>
  ),
}
})
vi.mock('../anomalies/AnomalyDetailView', async () => {
  const { Button } = await import('@/ui/button')
  return {
  AnomalyDetailView: ({ anomalyKey, onBack, onLocate }: {
    anomalyKey: string
    onBack: () => void
    onLocate?: (position: { lat: number; lng: number } | null) => void
  }) => (
    <div data-testid="anomaly-detail-view">
      {anomalyKey}
      <Button data-testid="anomaly-locate" onClick={() => onLocate?.({ lat: 45.7, lng: 4.8 })}>
        localiser
      </Button>
      <Button data-testid="anomaly-back" onClick={onBack}>
        retour
      </Button>
    </div>
  ),
}
})
vi.mock('../pulse/PalletPanel', async () => {
  const { Button } = await import('@/ui/button')
  return {
  PalletPanel: ({ position, range, onBack, onOpenAnomaly, onShowAnomalies, actions }: {
    position: { chipId: string }
    range: { from: Date; to: Date }
    onBack: () => void
    onOpenAnomaly?: (anomalyKey: string) => void
    onShowAnomalies?: () => void
    actions?: ReactNode
  }) => (
    <div data-testid="pallet-panel" data-days={Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000)}>
      {position.chipId}
      <Button data-testid="pallet-back" onClick={onBack}>
        retour
      </Button>
      <Button data-testid="pallet-dot" onClick={() => onOpenAnomaly?.(`ANO-${position.chipId}`)}>
        point
      </Button>
      <Button data-testid="pallet-anomalies-link" onClick={onShowAnomalies}>
        anomalies
      </Button>
      {actions}
    </div>
  ),
}
})

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const position = (chipId: string, lot: object | null, timestamp = daysAgo(0.5)) => ({
  contractId: 12, chipId, timestamp, latitude: 48.8, longitude: 2.3,
  ambientTemperature: 20, humidity: 50, mass: 320, mpuTemperature: 21, accelG: 1, remainingWeight: 320, lot,
})
const lot = (cpalLot: string, custLotNumber: string, status = 'created') => ({
  cpalLot, custLotNumber, productName: 'Doliprane', expiryDate: '2027-05-31', status,
})

let anomalyRows: unknown[] = []

beforeEach(() => {
  anomalyRows = []
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
          positions: [
            position('CHIP-A', lot('LOT-A', 'L-001')),
            position('CHIP-B', lot('LOT-B', 'L-002', 'closed')),
            position('CHIP-C', null, daysAgo(10)),
          ],
        })
      if (url.includes('/messages/contract.php')) return json({ message: null })
      if (url.includes('/anomalies/')) return json({ anomalies: anomalyRows })
      throw new Error(`Unexpected fetch: ${url}`)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

/** The router's current search, and the browser's back button. */
function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">{location.search}</output>
      <Button data-testid="browser-back" onClick={() => navigate(-1)}>
        back
      </Button>
    </>
  )
}

function renderPulse(entry = '/pulse') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/pulse" element={<ContractTestShell><Pulse /></ContractTestShell>} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}

const searchOf = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '')

describe('Pulse (KAN-272)', () => {
  it('always shows the contract anomalies on the right; the timeline bar is docked under the map, not over it', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    const panelCell = screen.getByTestId('pulse-anomalies-cell')
    expect(panelCell).toHaveClass('pulse-drawer-width')
    expect(panelCell).toContainElement(screen.getByTestId('anomalies-contract'))
    expect(panelCell).toHaveTextContent('Anomalies')
    expect(screen.queryByTestId('pulse-footer')).not.toBeInTheDocument()
    const bar = screen.getByTestId('pulse-timeline')
    expect(screen.getByTestId('pulse-map-column')).toContainElement(bar)
    expect(panelCell).not.toContainElement(bar)
    expect(bar).not.toHaveClass('absolute')
    expect(bar).toHaveClass('h-12', 'shrink-0', 'border-t')
    // The map and its overlays live in an isolated stacking context, under the shell's menus and popovers.
    expect(screen.getByTestId('pulse-split')).toHaveClass('isolate')
  })

  it('loads the contract from the Pulse endpoint and maps the devices reporting in the last 30 days by default, without the fleet panel', async () => {
    renderPulse()
    expect(await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-B')).toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-C')).toBeInTheDocument()
    expect(screen.getByTestId('pulse-period-30d')).toHaveAttribute('data-state', 'on')
    expect(screen.queryByTestId('fleet-panel')).not.toBeInTheDocument()
    // The load legend is a card over the map, always visible (not hidden in the layers popover).
    expect(screen.getByTestId('positions-map')).toContainElement(screen.getByTestId('load-legend'))
    expect(screen.getByTestId('map-layers')).not.toContainElement(screen.getByTestId('load-legend'))
    expect(screen.getByTestId('load-legend')).toHaveTextContent('Poids restant transporté')
  })

  it('the time selector drives the last-report period of the map and the pallet range', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('pulse-period')).toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-C')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pulse-period-7d'))
    expect(screen.queryByTestId('marker-CHIP-C')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pulse-period-30d'))
    expect(await screen.findByTestId('marker-CHIP-C')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('marker-CHIP-A'))
    expect(screen.getByTestId('pallet-panel')).toHaveAttribute('data-days', '30')

    await userEvent.click(screen.getByTestId('pulse-period-24h'))
    expect(screen.getByTestId('pallet-panel')).toHaveAttribute('data-days', '1')
    expect(screen.queryByTestId('marker-CHIP-C')).not.toBeInTheDocument()
    // CHIP-C reported 10 days ago: in 15j, not in 7j.
    await userEvent.click(screen.getByTestId('pulse-period-15d'))
    expect(screen.getByTestId('pallet-panel')).toHaveAttribute('data-days', '15')
    expect(await screen.findByTestId('marker-CHIP-C')).toBeInTheDocument()
    // The app's one preset set (owner 2026-11-25): 1j · 7j · 15j · 1 mois, in that order.
    const presets = screen.getAllByRole('radio').filter((item) => item.dataset.testid?.startsWith('pulse-period-'))
    expect(presets.map((item) => item.textContent)).toEqual(['1 j', '7 j', '15 j', '1 mois'])
  })

  it('a marker click opens that pallet (no anomaly list in it); back or a second click returns to the contract', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.click(screen.getByTestId('marker-CHIP-B'))
    expect(screen.getByTestId('marker-CHIP-B')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('pallet-panel')).toHaveTextContent('CHIP-B')
    expect(screen.queryByTestId('anomalies-CHIP-B')).not.toBeInTheDocument()
    expect(screen.queryByTestId('anomalies-contract')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pallet-back'))
    expect(screen.getByTestId('anomalies-contract')).toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-B')).toHaveAttribute('data-selected', 'false')

    await userEvent.click(screen.getByTestId('marker-CHIP-B'))
    await userEvent.click(screen.getByTestId('marker-CHIP-B'))
    expect(screen.getByTestId('anomalies-contract')).toBeInTheDocument()
  })

  it('an anomaly from the contract list takes the whole panel, locates it on the main map, and goes back', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.click(screen.getByTestId('anomalies-contract'))
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-contract')
    expect(screen.queryByTestId('anomalies-contract')).not.toBeInTheDocument()
    expect(screen.queryByTestId('map-focus')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('anomaly-locate'))
    expect(screen.getByTestId('map-focus')).toHaveTextContent('45.7,4.8@1')

    await userEvent.click(screen.getByTestId('anomaly-back'))
    expect(screen.getByTestId('anomalies-contract')).toBeInTheDocument()
    expect(screen.queryByTestId('map-focus')).not.toBeInTheDocument()
  })

  it('the pallet view carries the drawer’s collapse control in its own header, not in a separate row', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('pulse-drawer-collapse')).not.toHaveAccessibleName('')

    await userEvent.click(screen.getByTestId('marker-CHIP-A'))
    expect(screen.getAllByTestId('pulse-drawer-collapse')).toHaveLength(1)
    expect(screen.getByTestId('pallet-panel')).toContainElement(screen.getByTestId('pulse-drawer-collapse'))

    await userEvent.click(screen.getByTestId('pulse-drawer-collapse'))
    expect(screen.getByTestId('pulse-anomalies-cell')).toHaveClass('md:w-12')
  })

  it('the pallet’s anomalies link opens the drawer filtered on that pallet, until "Toutes les palettes"', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.click(screen.getByTestId('marker-CHIP-A'))
    await userEvent.click(screen.getByTestId('pallet-anomalies-link'))
    expect(screen.queryByTestId('pallet-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('pulse-anomalies-chip-filter')).toHaveTextContent('Palette CHIP-A')
    expect(screen.getByTestId('anomalies-CHIP-A')).toBeInTheDocument()

    // An anomaly opened from the filtered list comes back to the filtered list.
    await userEvent.click(screen.getByTestId('anomalies-CHIP-A'))
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-CHIP-A')
    await userEvent.click(screen.getByTestId('anomaly-back'))
    expect(screen.getByTestId('anomalies-CHIP-A')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('pulse-anomalies-chip-clear'))
    expect(screen.getByTestId('anomalies-contract')).toBeInTheDocument()
    expect(screen.queryByTestId('pulse-anomalies-chip-filter')).not.toBeInTheDocument()
  })

  it('an anomaly dot of the pallet charts returns to that pallet, keeping it selected', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.click(screen.getByTestId('marker-CHIP-A'))
    await userEvent.click(screen.getByTestId('pallet-dot'))
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-CHIP-A')
    expect(screen.queryByTestId('pallet-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-selected', 'true')

    await userEvent.click(screen.getByTestId('anomaly-locate'))
    await userEvent.click(screen.getByTestId('anomaly-back'))
    expect(screen.getByTestId('pallet-panel')).toHaveTextContent('CHIP-A')
    expect(screen.queryByTestId('map-focus')).not.toBeInTheDocument()
  })

  it('offers the lots (closed ones marked) and narrows the devices to the chosen lot', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    // The lot filter lives in the pallet selector's popover.
    await userEvent.click(screen.getByTestId('pulse-pallets'))
    await userEvent.click(await screen.findByTestId('pulse-lot-filter'))
    expect(await screen.findByTestId('pulse-lot-option-LOT-B', {}, { timeout: 5000 })).toHaveTextContent('L-002 — Doliprane (clôturé)')
    await userEvent.click(screen.getByTestId('pulse-lot-option-LOT-A'))

    await waitFor(() => expect(screen.queryByTestId('marker-CHIP-B')).not.toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByTestId('marker-CHIP-A')).toBeInTheDocument()
    expect(screen.queryByTestId('marker-CHIP-C')).not.toBeInTheDocument()
  })

  it('one click on a card opens its detail, selects and reveals its pallet; back keeps the card selected', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.click(screen.getByTestId('anomalies-select-contract'))
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-B')
    expect(screen.getByTestId('marker-CHIP-B')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('map-reveal')).toHaveTextContent('CHIP-B@1')
    expect(screen.queryByTestId('pallet-panel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('anomaly-back'))
    expect(screen.getByTestId('anomalies-list-contract')).toHaveAttribute('data-selected-key', 'ANO-B')

    // Same card again: its detail reopens and the map is asked to reveal it again.
    await userEvent.click(screen.getByTestId('anomalies-select-contract'))
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-B')
    expect(screen.getByTestId('map-reveal')).toHaveTextContent('CHIP-B@2')
  })

  it('hovering a card highlights its pallet marker', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.hover(screen.getByTestId('anomalies-select-contract'))
    expect(screen.getByTestId('marker-CHIP-B')).toHaveAttribute('data-highlighted', 'true')
    await userEvent.unhover(screen.getByTestId('anomalies-select-contract'))
    expect(screen.getByTestId('marker-CHIP-B')).toHaveAttribute('data-highlighted', 'false')
  })

  it('collapsed with a pallet open, the rail shows that pallet’s latest values, not the anomaly count', async () => {
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    await userEvent.click(screen.getByTestId('marker-CHIP-A'))
    await userEvent.click(screen.getByTestId('pulse-drawer-collapse'))

    const rail = screen.getByTestId('pallet-rail')
    expect(screen.queryByTestId('anomalies-rail')).not.toBeInTheDocument()
    expect(within(rail).getByTestId('pallet-rail-temperature')).toHaveTextContent('20°C')
    expect(within(rail).getByTestId('pallet-rail-humidity')).toHaveTextContent('50%HR')
    expect(within(rail).getByTestId('pallet-rail-accel')).toHaveTextContent('1g')
    expect(within(rail).getByTestId('pallet-rail-mass')).toHaveTextContent('320kg')

    await userEvent.click(rail)
    expect(screen.getByTestId('pallet-panel')).toHaveTextContent('CHIP-A')
  })

  it('collapses the drawer to a rail with the non-closed count, remembered across visits', async () => {
    const { unmount } = renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })

    await userEvent.click(screen.getByTestId('pulse-drawer-collapse'))
    const cell = screen.getByTestId('pulse-anomalies-cell')
    expect(cell).toHaveClass('md:w-12')
    expect(cell).not.toHaveClass('pulse-drawer-width')
    expect(await screen.findByTestId('anomalies-rail-count', {}, { timeout: 5000 })).toHaveTextContent('0')
    expect(window.localStorage.getItem('cpal.pulse.anomaliesDrawer')).toBe('collapsed')
    unmount()

    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('pulse-anomalies-cell')).toHaveClass('md:w-12')
    await userEvent.click(screen.getByTestId('anomalies-rail'))
    expect(screen.getByTestId('pulse-anomalies-cell')).toHaveClass('pulse-drawer-width')
    expect(window.localStorage.getItem('cpal.pulse.anomaliesDrawer')).toBe('expanded')
  })

  it('still opens when localStorage is unavailable', async () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    renderPulse()
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('pulse-anomalies-cell')).toHaveClass('pulse-drawer-width')
    await userEvent.click(screen.getByTestId('pulse-drawer-collapse'))
    expect(screen.getByTestId('pulse-anomalies-cell')).toHaveClass('md:w-12')
    vi.restoreAllMocks()
  })
  it('the breadcrumb follows the levels; each level but the last goes back through the history, like back', async () => {
    renderPulse()
    await userEvent.click(await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 }))
    expect(searchOf().get('palette')).toBe('CHIP-A')
    const crumb = screen.getByTestId('shell-breadcrumb')
    expect(crumb).toHaveAttribute('title', 'Pulse › CHIP-A')
    expect(within(crumb).getByTestId('breadcrumb-pallet')).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByTestId('pallet-anomalies-link'))
    expect(searchOf().get('vue')).toBe('anomalies')
    await userEvent.click(screen.getByTestId('anomalies-CHIP-A'))
    expect(searchOf().get('anomalie')).toBe('ANO-CHIP-A')
    expect(screen.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pulse › CHIP-A › Anomalies › Anomalie')

    // The breadcrumb's pallet level pops two entries: the browser's back then leaves Pulse's own levels.
    await userEvent.click(screen.getByTestId('breadcrumb-pallet'))
    expect(await screen.findByTestId('pallet-panel')).toHaveTextContent('CHIP-A')
    expect(searchOf().toString()).toBe('palette=CHIP-A')
    await userEvent.click(screen.getByTestId('browser-back'))
    await waitFor(() => expect(searchOf().toString()).toBe(''))
    expect(screen.getByTestId('anomalies-list-contract')).toBeInTheDocument()
    expect(screen.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pulse')
  })

  it('the browser back walks the levels the drawer opened, one at a time', async () => {
    renderPulse()
    await userEvent.click(await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 }))
    await userEvent.click(screen.getByTestId('pallet-dot'))
    expect(screen.getByTestId('anomaly-detail-view')).toHaveTextContent('ANO-CHIP-A')

    await userEvent.click(screen.getByTestId('browser-back'))
    expect(await screen.findByTestId('pallet-panel')).toHaveTextContent('CHIP-A')
    // The drawer's ← and the breadcrumb's root agree with it.
    await userEvent.click(screen.getByTestId('breadcrumb-pulse'))
    expect(await screen.findByTestId('anomalies-list-contract')).toBeInTheDocument()
    expect(searchOf().toString()).toBe('')
  })

  it('a deep link restores the pallet and the period', async () => {
    renderPulse('/pulse?palette=CHIP-A&periode=7j')
    expect(await screen.findByTestId('pallet-panel', {}, { timeout: 5000 })).toHaveTextContent('CHIP-A')
    expect(screen.getByTestId('pallet-panel')).toHaveAttribute('data-days', '7')
    expect(screen.getByTestId('pulse-period-7d')).toHaveAttribute('data-state', 'on')
    expect(screen.getByTestId('marker-CHIP-A')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('map-reveal')).toHaveTextContent('CHIP-A@')
    // The period choice writes back to the URL in place (no history entry).
    await userEvent.click(screen.getByTestId('pulse-period-24h'))
    await waitFor(() => expect(searchOf().get('periode')).toBe('1j'))
    expect(searchOf().get('palette')).toBe('CHIP-A')
  })

  it('the default 1 mois stays out of the URL; 15j and legacy links read back', async () => {
    const { unmount } = renderPulse('/pulse?periode=15j')
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('pulse-period-15d')).toHaveAttribute('data-state', 'on')
    await userEvent.click(screen.getByTestId('pulse-period-30d'))
    await waitFor(() => expect(searchOf().get('periode')).toBeNull())
    unmount()
    renderPulse('/pulse?periode=24h')
    await screen.findByTestId('marker-CHIP-A', {}, { timeout: 5000 })
    expect(screen.getByTestId('pulse-period-24h')).toHaveAttribute('data-state', 'on')
  })

  it('a deep link restores the anomaly (breadcrumb headline from the list) and a replay instant', async () => {
    const at = Date.now() - 2 * 86_400_000
    anomalyRows = [{
      anomalyKey: 'ANO-7', status: 'detectee', code: 'TEMP_MAX', label: 'Température max', threshold: 25, value: 31, excess: 6, unit: '°C',
      eventDate: new Date(at).toISOString().slice(0, 19).replace('T', ' '), detectedAt: null, chipId: 'CHIP-B', lot: null,
    }]
    renderPulse(`/pulse?anomalie=ANO-7&t=${at}`)
    expect(await screen.findByTestId('anomaly-detail-view', {}, { timeout: 5000 })).toHaveTextContent('ANO-7')
    await waitFor(() => expect(screen.getByTestId('breadcrumb-anomaly')).toHaveTextContent(/^Température max 31\s°C$/))
    expect(screen.getByTestId('pulse-freshness')).toHaveAttribute('data-mode', 'replay')
    expect(screen.getByTestId('pulse-timeline')).toHaveAttribute('data-mode', 'replay')
    // Back to live (the chip's ✕) drops the instant from the URL.
    await userEvent.click(screen.getByTestId('pulse-freshness-live'))
    await waitFor(() => expect(searchOf().get('t')).toBeNull())
    expect(searchOf().get('anomalie')).toBe('ANO-7')
  })
})
