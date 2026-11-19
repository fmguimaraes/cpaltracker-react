import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as anomaliesApi from '../api/anomalies'
import type { AnomalyDetail, AnomalyRow } from '../api/anomalies'
import { AnomaliesButton } from './AnomaliesButton'

const row: AnomalyRow = {
  anomalyKey: '80480-2',
  status: 'detectee',
  code: 'TH',
  label: 'Température >= 19 °C',
  threshold: 19,
  value: 19.5,
  unit: '°C',
  eventDate: '2026-11-05 21:57:00',
  detectedAt: '2026-11-19 15:34:02.120',
  chipId: 'cpaldev021',
  lot: { cpalLot: 'CPL-1', custLotNumber: '2026002', productName: 'Produit 2' },
}

const detail: AnomalyDetail = {
  ...row,
  contract: { contractId: 4, contractType: 'MAIN' },
  rule: 'TH19',
  readings: { temperature: 19.5, humidity: null, mass: 1000, acceleration: 0.15 },
  position: { lat: 43.48, lng: 5.37 },
  referencePoint: null,
  allowedTransitions: [],
  readOnlyReason: 'std_scope',
  lastChange: { at: '2026-11-19 15:37:24.916', by: { name: 'Marie Durand', sameOrganisation: true } },
  history: [
    {
      at: '2026-11-19 15:37:24.916',
      from: 'detectee',
      to: 'en_cours',
      by: { name: 'Marie Durand', sameOrganisation: true },
      comment: 'ligne 1\nligne 2',
    },
  ],
}

describe('AnomaliesButton (KAN-261)', () => {
  afterEach(() => vi.restoreAllMocks())

  async function openDrawer() {
    const user = userEvent.setup()
    render(<AnomaliesButton contractId={4} />)
    await user.click(screen.getByRole('button', { name: 'Anomalies' }))
    return user
  }

  it('lists the contract anomalies with status, value, device, lot and date, default filter non-closed', async () => {
    const fetchList = vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row])
    await openDrawer()

    const line = await screen.findByTestId('anomaly-row-80480-2')
    expect(line).toHaveTextContent('Détectée')
    expect(line).toHaveTextContent('TH — Température >= 19 °C')
    expect(line).toHaveTextContent('19,5 °C')
    expect(line).toHaveTextContent('cpaldev021')
    expect(line).toHaveTextContent('2026002')
    expect(line).toHaveTextContent('2026-11-05 21:57 UTC')
    expect(fetchList).toHaveBeenCalledWith(4, undefined)
  })

  it('reloads with the chosen status filter', async () => {
    const fetchList = vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row])
    const user = await openDrawer()
    await screen.findByTestId('anomaly-list')

    await user.selectOptions(screen.getByTestId('anomaly-status-filter'), 'cloturee')
    await waitFor(() => expect(fetchList).toHaveBeenLastCalledWith(4, ['cloturee']))
  })

  it('shows the empty state', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([])
    await openDrawer()
    expect(await screen.findByText('Aucune anomalie pour ces critères')).toBeInTheDocument()
  })

  it('shows an error with a retry', async () => {
    const fetchList = vi.spyOn(anomaliesApi, 'fetchAnomalies').mockRejectedValueOnce(new Error('boom'))
    fetchList.mockResolvedValue([row])
    const user = await openDrawer()

    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByTestId('anomaly-row-80480-2')).toBeInTheDocument()
  })

  it('opens an anomaly detail with its history and goes back to the table', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row])
    const fetchDetail = vi.spyOn(anomaliesApi, 'fetchAnomalyDetail').mockResolvedValue(detail)
    const user = await openDrawer()

    await user.click(await screen.findByTestId('anomaly-open-80480-2'))
    expect(await screen.findByTestId('anomaly-facts')).toHaveTextContent('TH19')
    expect(fetchDetail).toHaveBeenCalledWith(4, '80480-2')
    expect(screen.getByTestId('anomaly-position')).toHaveTextContent('43.48, 5.37')
    expect(screen.getByTestId('anomaly-history-0')).toHaveTextContent('Marie Durand')
    expect(screen.getByTestId('anomaly-history-0')).toHaveTextContent('Détectée → En cours')
    expect(screen.getByTestId('anomaly-history-0')).toHaveTextContent('ligne 1')
    expect(screen.getByTestId('anomaly-history-detected')).toHaveTextContent('Système')

    await user.click(screen.getByTestId('anomaly-back'))
    expect(await screen.findByTestId('anomaly-list')).toBeInTheDocument()
  })
})
