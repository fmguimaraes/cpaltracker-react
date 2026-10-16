import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HistoryDashboardLink } from './HistoryDashboardLink'

describe('HistoryDashboardLink (KAN-165 FR14)', () => {
  it('builds a link to the history route carrying contrat_id, date_from and date_to', () => {
    render(
      <MemoryRouter>
        <HistoryDashboardLink contractId={12} />
      </MemoryRouter>,
    )

    const link = screen.getByTestId('history-dashboard-link')
    const href = link.getAttribute('href') ?? ''
    expect(href).toContain('/history?')
    const params = new URLSearchParams(href.split('?')[1])
    expect(params.get('contrat_id')).toBe('12')
    expect(params.get('date_from')).toBeTruthy()
    expect(params.get('date_to')).toBeTruthy()
  })

  it('updates the link href when the date inputs change', () => {
    render(
      <MemoryRouter>
        <HistoryDashboardLink contractId={12} />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByTestId('history-date-from'), { target: { value: '2026-01-01T00:00' } })

    const href = screen.getByTestId('history-dashboard-link').getAttribute('href') ?? ''
    expect(decodeURIComponent(href)).toContain('date_from=2026-01-01T00:00')
  })
})
