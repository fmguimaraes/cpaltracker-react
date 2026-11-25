import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as anomaliesApi from '../api/anomalies'
import type { AnomalyDetail } from '../api/anomalies'
import { AnomalyDetailView } from './AnomalyDetailView'
import { Button } from '@/ui/button'
import { TooltipProvider } from '@/ui/tooltip'

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
  lot: null,
  contract: { contractId: 4, contractType: 'MAIN' },
  rule: 'TH19',
  readings: { temperature: 19.5, humidity: null, mass: null, acceleration: null },
  position: { lat: 43.48, lng: 5.37 },
  referencePoint: null,
  allowedTransitions: [{ to: 'fermee', commentRequired: true }],
  readOnlyReason: null,
  lastChange: { at: '2026-11-19 15:37:24.916', by: { name: 'Marie Durand', sameOrganisation: true } },
  history: [
    {
      at: '2026-11-20 09:00:00.000',
      from: 'en_cours',
      to: 'en_cours',
      by: { name: 'Paul Martin', sameOrganisation: true },
      comment: 'Sonde changée',
    },
    {
      at: '2026-11-19 15:37:24.916',
      from: 'detectee',
      to: 'en_cours',
      by: { name: 'Marie Durand', sameOrganisation: true },
      comment: null,
    },
  ],
}

/** Intl uses (narrow) non-breaking spaces in numbers and times. */
const plain = (text: string | null | undefined) => (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

const NOW = new Date('2026-11-25T12:00:00Z')

function renderView(value: AnomalyDetail = detail, props: Partial<React.ComponentProps<typeof AnomalyDetailView>> = {}) {
  vi.spyOn(anomaliesApi, 'fetchAnomalyDetail').mockResolvedValue(value)
  return render(
    <TooltipProvider>
      <AnomalyDetailView contractId={4} anomalyKey="80480-2" onBack={() => {}} now={NOW} {...props} />
    </TooltipProvider>,
  )
}

describe('AnomalyDetailView', () => {
  afterEach(() => vi.restoreAllMocks())

  it('has a two-line header: back, the card title and excess, the host actions; then status · chip · local time', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    renderView(detail, { onBack, actions: <Button>Réduire</Button> })

    expect(plain((await screen.findByTestId('anomaly-title')).textContent)).toBe('Température 19,5 °C')
    expect(plain(screen.getByTestId('anomaly-excess').textContent)).toBe('+0,5 °C')
    const header = screen.getByTestId('anomaly-header')
    expect(within(header).getByRole('button', { name: 'Réduire' })).toBeInTheDocument()
    const subtitle = screen.getByTestId('anomaly-subtitle')
    expect(subtitle).toHaveTextContent('En cours')
    expect(subtitle).toHaveTextContent('cpaldev021')
    expect(subtitle).not.toHaveTextContent('UTC')
    expect(screen.queryByTestId('anomaly-last-change')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retour à la liste' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows the closed-for-review status as the Clôturée pill plus a muted "provisoire"', async () => {
    renderView({ ...detail, status: 'fermee' })
    expect(await screen.findByTestId('anomaly-status')).toHaveTextContent(/^Clôturée$/)
    expect(screen.getByTestId('anomaly-status-qualifier')).toHaveTextContent('provisoire')
  })

  it('orders the sections context, readings, treatment, history', async () => {
    renderView()
    await screen.findByTestId('anomaly-context')
    const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(titles).toEqual(['Contexte', 'Relevés au moment de la mesure', 'Traitement', 'Historique'])
  })

  it('states the threshold (rule code only in its tooltip), local times and the detection delay past 1 h', async () => {
    renderView()
    const context = await screen.findByTestId('anomaly-context')
    expect(plain(screen.getByTestId('anomaly-threshold').textContent)).toBe('Seuil 19 °C')
    expect(context).not.toHaveTextContent('TH19')
    expect(context).not.toHaveTextContent('UTC')
    expect(context).not.toHaveTextContent('—')
    expect(screen.getByTestId('anomaly-measured')).toHaveAttribute('dateTime', expect.stringMatching(/^2026-11-0[56]T/))
    expect(plain(screen.getByTestId('anomaly-delay').textContent)).toBe('+13 j')
    expect(plain(screen.getByTestId('anomaly-position').textContent)).toBe('Position 43,48, 5,37')
    expect(screen.queryByTestId('anomaly-lot')).not.toBeInTheDocument()
    expect(screen.queryByText(/rapport/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('anomaly-minimap')).not.toBeInTheDocument()
  })

  it('hides the delay within the hour, and joins the lot fields present', async () => {
    renderView({
      ...detail,
      detectedAt: '2026-11-05 22:30:00.000',
      lot: { cpalLot: 'CP-1', custLotNumber: null, productName: 'Yaourt' },
    })
    expect(await screen.findByTestId('anomaly-lot')).toHaveTextContent(/^Lot cPAL CP-1 · Produit Yaourt$/)
    expect(screen.queryByTestId('anomaly-delay')).not.toBeInTheDocument()
  })

  it('shows a geofence as on its card, its reference point and radius in km, never degrees', async () => {
    renderView({
      ...detail,
      code: 'LF',
      rule: 'LF',
      label: 'Hors zone',
      unit: '°',
      value: 0.05,
      threshold: 0.02,
      excess: null,
      referencePoint: { lat: 48.85341, lng: 2.3488 },
    })
    expect(plain((await screen.findByTestId('anomaly-title')).textContent)).toBe('Hors zone · ≈ 5,6 km du centre')
    expect(screen.queryByTestId('anomaly-threshold')).not.toBeInTheDocument()
    expect(plain(screen.getByTestId('anomaly-reference').textContent)).toBe('Point de référence 48,8534, 2,3488 · rayon 2,2 km')
    expect(screen.getByTestId('anomaly-context')).not.toHaveTextContent('°')
  })

  it('opens the pallet from "Voir la palette →"', async () => {
    const user = userEvent.setup()
    const onShowPallet = vi.fn()
    renderView(detail, { onShowPallet })
    await user.click(await screen.findByRole('button', { name: 'Voir la palette →' }))
    expect(onShowPallet).toHaveBeenCalledWith('cpaldev021')
  })

  it('shows the available readings as tiles, the triggering one with its threshold, mass grouped', async () => {
    renderView({ ...detail, readings: { temperature: 19.5, humidity: null, mass: 12000, acceleration: 1 } })
    await screen.findByTestId('anomaly-readings')
    expect(screen.queryByTestId('anomaly-reading-humidity')).not.toBeInTheDocument()
    expect(plain(screen.getByTestId('anomaly-reading-mass').textContent)).toBe('Poids 12 000 kg')
    const temperature = screen.getByTestId('anomaly-reading-temperature')
    expect(temperature).toHaveAttribute('data-triggering', 'true')
    expect(plain(temperature.textContent)).toBe('Température 19,5 °Cseuil 19 °C')
    expect(screen.getByTestId('anomaly-reading-acceleration')).toHaveAttribute('data-triggering', 'false')
  })

  it('shows comments distinctly from status changes in a newest-first timeline, ending on the detection', async () => {
    renderView()
    const comment = await screen.findByTestId('anomaly-history-0')
    expect(comment).toHaveAttribute('data-kind', 'comment')
    expect(comment).toHaveTextContent('Commentaire')
    expect(comment).toHaveTextContent(/^CommentairePaul Martin · il y a 5 j · 20 nov\. \d\d:00Sonde changée$/)
    expect(comment).not.toHaveTextContent('→')
    const change = screen.getByTestId('anomaly-history-1')
    expect(change).toHaveAttribute('data-kind', 'status')
    expect(change).toHaveTextContent('À traiter → En cours')
    expect(screen.getByTestId('anomaly-history-detected')).toHaveTextContent('Système')
  })

  it('shows the last 5 events, then all of them on demand', async () => {
    const user = userEvent.setup()
    const history = Array.from({ length: 6 }, (_, index) => ({ ...detail.history[0], at: `2026-11-2${index} 09:00:00.000` }))
    renderView({ ...detail, history })
    await screen.findByTestId('anomaly-history')
    expect(screen.getAllByRole('listitem').filter((item) => item.dataset.kind)).toHaveLength(5)
    await user.click(screen.getByRole('button', { name: 'Afficher tout (7)' }))
    expect(screen.getAllByRole('listitem').filter((item) => item.dataset.kind)).toHaveLength(7)
    expect(screen.queryByTestId('anomaly-history-all')).not.toBeInTheDocument()
  })

  it('locates the anomaly once loaded, and clears it on back and on unmount', async () => {
    const onLocate = vi.fn()
    const onBack = vi.fn()
    const user = userEvent.setup()
    const { unmount } = renderView(detail, { onBack, onLocate })

    await screen.findByTestId('anomaly-context')
    expect(onLocate).toHaveBeenCalledTimes(1)
    expect(onLocate).toHaveBeenLastCalledWith({ lat: 43.48, lng: 5.37 })

    await user.click(screen.getByTestId('anomaly-back'))
    expect(onBack).toHaveBeenCalled()
    expect(onLocate).toHaveBeenLastCalledWith(null)

    onLocate.mockClear()
    unmount()
    expect(onLocate).toHaveBeenCalledWith(null)
  })

  it('passes a null position when the reading has none, and omits the position line', async () => {
    const onLocate = vi.fn()
    renderView({ ...detail, position: null }, { onLocate })
    await screen.findByTestId('anomaly-context')
    expect(onLocate).toHaveBeenCalledWith(null)
    expect(screen.queryByTestId('anomaly-position')).not.toBeInTheDocument()
  })
})
