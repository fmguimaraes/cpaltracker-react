import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnomalyRow } from '../api/anomalies'
import type { HistoryHook, HistoryResponse, HistoryRow } from '../api/history'
import type { Position } from '../api/positions'
import { anomaliesPillLabel, PalletPanel, palletSubtitle } from './PalletPanel'

// jsdom implements neither canvas nor WebGL, which real Plotly probes at import time. The stand-in keeps
// the last props it was given, so a test can read the figure and fire a click on it.
const plot = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({
  default: () => (props: Record<string, unknown>) => {
    plot.props = props
    return <div data-testid="mock-plot" />
  },
}))

const fetchContractHistory = vi.fn<(...args: unknown[]) => Promise<HistoryResponse>>()
vi.mock('../api/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/history')>()),
  fetchContractHistory: (...args: unknown[]) => fetchContractHistory(...args),
}))
const fetchAnomalies = vi.fn<(...args: unknown[]) => Promise<AnomalyRow[]>>()
vi.mock('../api/anomalies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/anomalies')>()),
  fetchAnomalies: (...args: unknown[]) => fetchAnomalies(...args),
}))

const FROM = new Date('2026-11-01T00:00:00Z')
const TO = new Date('2026-11-08T00:00:00Z')
const HOUR = 3_600_000

const position: Position = {
  contractId: 7,
  chipId: 'CHIP-1',
  timestamp: '2026-11-07T10:00:00Z',
  latitude: 45,
  longitude: 4,
  ambientTemperature: 5,
  humidity: 50,
  mass: 420,
  mpuTemperature: null,
  accelG: 0.1,
  lot: {
    cpalLot: '2410',
    custLotNumber: 'LOT-2410-C',
    productName: 'Lait corporel 400 ml',
    expiryDate: '2027-03-31',
    status: 'created',
  },
}

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return { c: 'CHIP-1', t: 0, ts: '', p: 0, la: null, lo: null, ta: null, hr: null, m: null, g: null, tm: null, ...overrides }
}

function anomaly(overrides: Partial<AnomalyRow>): AnomalyRow {
  return {
    anomalyKey: 'ANO-1',
    status: 'detectee',
    code: 'TH',
    label: '',
    threshold: 28,
    value: 31,
    excess: 3,
    unit: '°C',
    eventDate: '2026-11-06 09:00:00',
    detectedAt: '2026-11-06 09:00:00',
    chipId: 'CHIP-1',
    lot: null,
    ...overrides,
  }
}

function response(rows: HistoryRow[], sampled = false): HistoryResponse {
  return {
    contract: { ContratID: 7, ContratRef: 'MAIN-2026-014', ContratType: 'MAIN', ClientID: 1, DebutContrat: null, FinContrat: null },
    devices: [],
    rows,
    hooks: [],
    count: rows.length,
    total: rows.length,
    sampled,
    summaries: { ta: null, hr: null, m: null },
  }
}

/** Hourly readings of CHIP-1 ending at the position's last report (2026-11-07 10:00 UTC). */
const LAST = Date.parse('2026-11-07T10:00:00Z')
const readings = (count: number, values: Partial<HistoryRow> = { ta: 20, hr: 50, g: 1, m: 12000 }) =>
  Array.from({ length: count }, (_, i) => row({ t: LAST - (count - 1 - i) * HOUR, ...values }))

function renderPanel(props: Partial<Parameters<typeof PalletPanel>[0]> = {}) {
  const onBack = vi.fn()
  const onOpenAnomaly = vi.fn()
  const onShowAnomalies = vi.fn()
  render(
    <PalletPanel
      contractId={7}
      position={position}
      range={{ from: FROM, to: TO }}
      onBack={onBack}
      onOpenAnomaly={onOpenAnomaly}
      onShowAnomalies={onShowAnomalies}
      now={new Date(LAST + 30 * 60_000)}
      {...props}
    />,
    { wrapper: MemoryRouter },
  )
  return { onBack, onOpenAnomaly, onShowAnomalies }
}

beforeEach(() => {
  fetchContractHistory.mockReset()
  fetchAnomalies.mockReset()
  fetchAnomalies.mockResolvedValue([])
  plot.props = null
})

describe('palletSubtitle / anomaliesPillLabel', () => {
  it('joins contract, product and lot, whichever exist', () => {
    expect(palletSubtitle('MAIN-2026-014', position.lot)).toBe('contrat MAIN-2026-014 · Lait corporel 400 ml · lot LOT-2410-C')
    expect(palletSubtitle(null, { ...position.lot!, productName: null, custLotNumber: null })).toBe('lot 2410')
    expect(palletSubtitle(null, null)).toBe('')
  })

  it('agrees in number', () => {
    expect(anomaliesPillLabel(1)).toBe('1 anomalie →')
    expect(anomaliesPillLabel(3)).toBe('3 anomalies →')
  })
})

describe('PalletPanel', () => {
  it('fits the header in two lines: back, chip ID and host controls; then context and last report', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(5)))
    const { onBack } = renderPanel({ actions: <span data-testid="host-action" /> })

    const header = screen.getByTestId('pallet-header')
    expect(header.children).toHaveLength(2)
    const row1 = header.children[0]
    expect(row1).toContainElement(screen.getByRole('heading', { name: 'CHIP-1' }))
    expect(row1).toContainElement(screen.getByTestId('host-action'))
    await waitFor(() =>
      expect(screen.getByTestId('pallet-subtitle')).toHaveTextContent(
        'contrat MAIN-2026-014 · Lait corporel 400 ml · lot LOT-2410-C · Dernier relevé il y a 30 min',
      ),
    )
    expect(screen.getByTestId('pallet-last-report')).toHaveAttribute('data-stale', 'false')
    expect(screen.queryByText('← Anomalies')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retour aux anomalies' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('flags the last report in amber when older than 2× the median reporting interval', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(5)))
    renderPanel({ now: new Date(LAST + 10 * 24 * HOUR) })

    await waitFor(() => expect(screen.getByTestId('pallet-last-report')).toHaveAttribute('data-stale', 'true'))
    expect(screen.getByTestId('pallet-last-report')).toHaveTextContent('Dernier relevé il y a 10 j')
    expect(screen.getByTestId('pallet-last-report')).toHaveClass('text-warning')
    expect(screen.getByLabelText('Relevé en retard')).toBeInTheDocument()
  })

  it('omits what the pallet does not have', () => {
    fetchContractHistory.mockReturnValue(new Promise(() => {}))
    fetchAnomalies.mockReturnValue(new Promise(() => {}))
    renderPanel({ position: { ...position, lot: null, timestamp: null } })

    expect(screen.getByRole('heading', { name: 'CHIP-1' })).toBeInTheDocument()
    expect(screen.queryByTestId('pallet-subtitle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pallet-last-report')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pallet-anomalies-link')).not.toBeInTheDocument()
  })

  it('shows the anomaly pill (anomalies of the period) only when there are some, opening the filtered drawer', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(5)))
    fetchAnomalies.mockResolvedValue([
      anomaly({}),
      anomaly({ anomalyKey: 'ANO-2', status: 'fermee' }),
      anomaly({ anomalyKey: 'ANO-OLD', eventDate: '2026-09-01 09:00:00' }),
      anomaly({ anomalyKey: 'ANO-OTHER', chipId: 'OTHER' }),
    ])
    const { onShowAnomalies } = renderPanel()

    const link = await screen.findByTestId('pallet-anomalies-link')
    expect(link).toHaveTextContent('2 anomalies →')
    expect(screen.getByTestId('pallet-header').children[0]).toContainElement(link)
    fireEvent.click(link)
    expect(onShowAnomalies).toHaveBeenCalledOnce()
  })

  it("asks this pallet's history over the range, and every anomaly status", () => {
    fetchContractHistory.mockReturnValue(new Promise(() => {}))
    fetchAnomalies.mockReturnValue(new Promise(() => {}))
    renderPanel()

    expect(screen.getByTestId('pallet-loading')).toBeInTheDocument()
    expect(fetchContractHistory).toHaveBeenCalledWith(7, { start: FROM, end: TO }, 'CHIP-1')
    expect(fetchAnomalies).toHaveBeenCalledWith(7, ['detectee', 'en_cours', 'fermee', 'cloturee'])
  })

  it('draws the measures of this pallet in one figure, with no weight gauge, KPI or min/max footer', async () => {
    fetchContractHistory.mockResolvedValue(response([...readings(3), row({ c: 'OTHER', t: LAST, m: 5000, ta: 30 })], true))
    renderPanel()

    const charts = await screen.findByTestId('pallet-charts')
    expect(charts).toHaveAttribute('data-rows', '4')
    expect(charts).toHaveClass('h-139')
    // Block headers: label, then the last value (bold, no "dernier :"), with the date as tooltip.
    const temperature = screen.getByTestId('pallet-block-ta')
    expect(temperature).toHaveTextContent('TEMPÉRATURE')
    expect(screen.getByTestId('pallet-value-ta')).toHaveTextContent('20 °C')
    expect(screen.getByTestId('pallet-value-ta')).toHaveAttribute('title', expect.stringMatching(/^dernier relevé · /))
    expect(temperature).not.toHaveClass('border-t')
    expect(screen.getByTestId('pallet-block-hr')).toHaveClass('border-t', 'border-border')
    expect(screen.getAllByTestId('mock-plot')).toHaveLength(1)
    expect(screen.queryByTestId('pallet-weight-ramp')).not.toBeInTheDocument()
    expect(screen.queryByText('Poids restant transporté')).not.toBeInTheDocument()
    expect(screen.queryByText('Poids restant')).not.toBeInTheDocument()
    expect(screen.queryByText(/^min /)).not.toBeInTheDocument()
    expect(screen.getByText('Mesures échantillonnées sur la période.')).toBeInTheDocument()
  })

  it('keeps a short block for a measure without readings: a smaller figure', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(3, { ta: 20, m: 600 })))
    renderPanel()

    const charts = await screen.findByTestId('pallet-charts')
    expect(charts).toHaveAttribute('data-rows', '2')
    expect(charts).toHaveClass('h-115')
    expect(screen.getAllByText('Aucun relevé')).toHaveLength(2)
    expect(screen.getByTestId('pallet-value-hr')).toHaveTextContent('—')
  })

  it('notes the data span when it covers less than half of the period', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(5)))
    renderPanel()

    expect(await screen.findByTestId('pallet-coverage')).toHaveTextContent(/^Données du 7 nov\. \d\d:\d\d au 7 nov\. \d\d:\d\d$/)
  })

  it('opens the anomaly of a clicked dot, and ignores clicks on readings', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(5)))
    fetchAnomalies.mockResolvedValue([anomaly({ eventDate: '2026-11-07 08:00:00' })])
    const { onOpenAnomaly } = renderPanel()

    await screen.findByTestId('pallet-anomalies-link')
    await waitFor(() => expect(plot.props).not.toBeNull())
    const onClick = plot.props!.onClick as (event: unknown) => void
    onClick({ points: [{ customdata: '20 °C' }] })
    expect(onOpenAnomaly).not.toHaveBeenCalled()
    onClick({ points: [{ customdata: ['Température 31 °C', 'ANO-1'] }] })
    expect(onOpenAnomaly).toHaveBeenCalledWith('ANO-1')
  })

  it('shows the no-data state when the pallet has no reading in the range', async () => {
    fetchContractHistory.mockResolvedValue(response([row({ c: 'OTHER', t: LAST, m: 600 })]))
    renderPanel()

    expect(await screen.findByTestId('pallet-empty')).toHaveTextContent('Aucune mesure de cette palette sur la période.')
  })

  it('shows an error and retries', async () => {
    fetchContractHistory.mockRejectedValueOnce(new Error('boom'))
    fetchContractHistory.mockResolvedValueOnce(response(readings(2)))
    renderPanel()

    expect(await screen.findByTestId('pallet-error')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByTestId('pallet-charts')).toBeInTheDocument()
    await waitFor(() => expect(fetchContractHistory).toHaveBeenCalledTimes(2))
  })

  it('says when the thresholds and anomalies could not be loaded', async () => {
    fetchContractHistory.mockResolvedValue(response(readings(2)))
    fetchAnomalies.mockRejectedValue(new Error('boom'))
    renderPanel()

    expect(await screen.findByTestId('pallet-anomalies-error')).toHaveTextContent('Seuils et anomalies indisponibles.')
  })

  it('links to the device page of the panel contract, in a new tab', () => {
    fetchContractHistory.mockReturnValue(new Promise(() => {}))
    renderPanel()
    const link = screen.getByTestId('pallet-device-page')
    expect(link).toHaveAttribute('href', `/pilotage/${encodeURIComponent(position.chipId)}?contrat_id=7`)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAccessibleName(`Ouvrir la page du device ${position.chipId} dans un nouvel onglet`)
  })

  it('does not re-fetch when the parent re-creates the same range', () => {
    fetchContractHistory.mockReturnValue(new Promise(() => {}))
    fetchAnomalies.mockReturnValue(new Promise(() => {}))
    const { rerender } = render(
      <PalletPanel contractId={7} position={position} range={{ from: FROM, to: TO }} onBack={() => {}} />,
      { wrapper: MemoryRouter },
    )
    rerender(
      <PalletPanel contractId={7} position={position} range={{ from: new Date(FROM), to: new Date(TO) }} onBack={() => {}} />,
    )
    expect(fetchContractHistory).toHaveBeenCalledOnce()
  })

  it('adds a "Période" section: readings, temperature range and Δ24h per metric', async () => {
    // 25 hourly readings: the temperature climbs 0.5 °C an hour, the weight loses 10 kg an hour.
    const rows = Array.from({ length: 25 }, (_, i) => row({ t: LAST - (24 - i) * HOUR, ta: 4 + i / 2, hr: 50, m: 500 - 10 * i }))
    fetchContractHistory.mockResolvedValue(response([...rows, row({ c: 'OTHER', t: LAST, ta: 40 })]))
    renderPanel()

    const period = await screen.findByTestId('pallet-period')
    expect(period).toHaveAccessibleName('Période')
    expect(screen.getByTestId('pallet-period-count')).toHaveTextContent('25')
    expect(screen.getByTestId('pallet-period-temperature')).toHaveTextContent(/^4\s°C – 16\s°C$/)
    expect(screen.getByTestId('pallet-period-delta-ta')).toHaveTextContent(/^\+12\s°C$/)
    expect(screen.getByTestId('pallet-period-delta-hr')).toHaveTextContent(/^\+?0\s%HR$/)
    expect(screen.getByTestId('pallet-period-delta-m')).toHaveTextContent(/^[−-]240\skg$/)
    // No lot hook for this pallet: no section.
    expect(screen.queryByTestId('pallet-lot-hooks')).not.toBeInTheDocument()
  })

  it('no "Période" section without a reading in the period', async () => {
    fetchContractHistory.mockResolvedValue(response([row({ c: 'OTHER', t: LAST, m: 600 })]))
    renderPanel()
    await screen.findByTestId('pallet-empty')
    expect(screen.queryByTestId('pallet-period')).not.toBeInTheDocument()
  })

  it('lists the pallet’s lot attach history in local time, the ongoing one marked "en cours"', async () => {
    const hook = (c: string, lot: string, cust: string | null, from: number, to: number): HistoryHook => ({ c, lot, cust, from, to, net: null, gros: null, nb: null, per: null })
    fetchContractHistory.mockResolvedValue({
      ...response(readings(5)),
      hooks: [
        hook('CHIP-1', '2400', 'LOT-2400-C', Date.parse('2026-11-01T08:00:00Z'), Date.parse('2026-11-03T08:00:00Z')),
        hook('OTHER', '9999', null, Date.parse('2026-11-01T08:00:00Z'), Date.parse('2026-11-02T08:00:00Z')),
        hook('CHIP-1', '2410', null, Date.parse('2026-11-03T09:00:00Z'), Date.parse('2099-12-31T00:00:00Z')),
      ],
    })
    renderPanel()

    const section = await screen.findByTestId('pallet-lot-hooks')
    expect(section).toHaveAccessibleName('Historique des lots')
    // Most recent first; the other pallet's hook is left out.
    expect(screen.getByTestId('pallet-lot-hook-0')).toHaveTextContent(/^Lot 2410\d{1,2}\snov\.\s\d{2}:\d{2} – en cours$/)
    expect(screen.getByTestId('pallet-lot-hook-1')).toHaveTextContent(/^Lot LOT-2400-C · cPAL 2400\d{1,2}\snov\.\s\d{2}:\d{2} – \d{1,2}\snov\.\s\d{2}:\d{2}$/)
    expect(screen.queryByTestId('pallet-lot-hook-2')).not.toBeInTheDocument()
    expect(section).not.toHaveTextContent(/UTC|2026-11/)
  })
})
