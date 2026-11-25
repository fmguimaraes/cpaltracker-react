import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as anomaliesApi from '../api/anomalies'
import type { AnomalyRow } from '../api/anomalies'
import { AnomaliesRail } from './AnomaliesRail'

const row = (anomalyKey: string, chipId: string, status: AnomalyRow['status']): AnomalyRow => ({
  anomalyKey, status, code: 'TH', label: 'Température >= 19 °C', threshold: 19, value: 20, excess: 1, unit: '°C',
  eventDate: '2026-11-05 21:57:00', detectedAt: '2026-11-19 15:34:02.120', chipId, lot: null,
})

describe('AnomaliesRail', () => {
  afterEach(() => vi.restoreAllMocks())

  it('counts the non-closed anomalies and expands on click', async () => {
    const fetchList = vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([
      row('1', 'a', 'detectee'),
      row('2', 'b', 'en_cours'),
      row('3', 'a', 'fermee'),
    ])
    const onExpand = vi.fn()
    render(<AnomaliesRail contractId={4} onExpand={onExpand} />)

    expect(await screen.findByTestId('anomalies-rail-count')).toHaveTextContent('2')
    expect(fetchList).toHaveBeenCalledWith(4, ['detectee', 'en_cours'])
    const rail = screen.getByRole('button', { name: 'Afficher les anomalies (2 non clôturées)' })
    await userEvent.setup().click(rail)
    expect(onExpand).toHaveBeenCalled()
  })

  it('follows the map viewport filter', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1', 'a', 'detectee'), row('2', 'b', 'en_cours')])
    render(<AnomaliesRail contractId={4} visibleChipIds={new Set(['b'])} onExpand={() => {}} />)
    expect(await screen.findByTestId('anomalies-rail-count')).toHaveTextContent('1')
  })
})
