import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryResponse } from '../api/history'
import { HistoryReadyPanel } from './HistoryReadyPanel'

// See HistoryCharts.test.tsx's comment: Plotly needs a real <canvas> and
// probes WebGL at import time, neither of which jsdom implements — mocked
// here too since this panel mounts `HistoryCharts`. `vi.mock` calls are
// hoisted above imports by Vitest, so this still applies before
// `HistoryReadyPanel`'s own import of `HistoryCharts` resolves.
vi.mock('plotly.js-dist-min', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({
  default: () => () => <div data-testid="mock-plot" />,
}))

function historyResponse(overrides: Partial<HistoryResponse> = {}): HistoryResponse {
  return {
    contract: {
      ContratID: 1,
      ContratRef: 'REF-1',
      ContratType: 'STD',
      ClientID: 1,
      DebutContrat: null,
      FinContrat: null,
    },
    devices: [
      { ChipID: 'CHIP-A', STATUT: 'actif', MORT: 0 },
      { ChipID: 'CHIP-B', STATUT: 'actif', MORT: 0 },
    ],
    rows: [
      {
        c: 'CHIP-A',
        t: 1000,
        ts: '2026-01-01T00:00:01',
        p: 1,
        la: 43.5,
        lo: 5.4,
        ta: 18,
        hr: 50,
        m: 150,
        g: 1,
        tm: 20,
      },
      {
        c: 'CHIP-B',
        t: 1000,
        ts: '2026-01-01T00:00:01',
        p: 1,
        la: 44,
        lo: 6,
        ta: 25,
        hr: 55,
        m: 600,
        g: 1,
        tm: 21,
      },
    ],
    hooks: [],
    count: 2,
    total: 2,
    sampled: false,
    ...overrides,
  }
}

describe('HistoryReadyPanel (KAN-175 FR4, FR9, FR19-24, NFR3)', () => {
  it('renders the map, checklist, charts, lot-hooks and selection summary together', async () => {
    render(<HistoryReadyPanel history={historyResponse()} />)

    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2))
    expect(screen.getByTestId('device-checklist')).toBeInTheDocument()
    expect(screen.getByTestId('history-charts')).toBeInTheDocument()
    expect(screen.getByTestId('lot-hook-history-empty')).toBeInTheDocument()
    expect(screen.getByTestId('selection-summary')).toBeInTheDocument()
  })

  it('unchecking a device in the checklist hides its marker and shrinks the summary, with no refetch (FR9, FR20)', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<HistoryReadyPanel history={historyResponse()} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('device-checklist-item-CHIP-B'))

    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))
    expect(screen.getByTestId('selection-summary-count')).toHaveTextContent('1 mesure(s)')
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('shows the sampling banner when the response is sampled (FR22)', () => {
    render(<HistoryReadyPanel history={historyResponse({ sampled: true, count: 10, total: 100 })} />)
    expect(screen.getByTestId('history-sampling-banner')).toBeInTheDocument()
  })

  it('shows "no measurements" instead of empty panels when there are zero rows (FR23)', () => {
    render(<HistoryReadyPanel history={historyResponse({ rows: [], count: 0 })} />)
    expect(screen.getByTestId('history-no-measurements')).toBeInTheDocument()
  })

  it('resets the device selection back to "all" when a new history response arrives', async () => {
    const first = historyResponse()
    const { rerender } = render(<HistoryReadyPanel history={first} />)
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2))

    fireEvent.click(screen.getByTestId('device-checklist-item-CHIP-B'))
    await waitFor(() => expect(document.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1))

    const second = historyResponse()
    rerender(<HistoryReadyPanel history={second} />)

    await waitFor(() => expect(screen.getByTestId('device-checklist-item-CHIP-B')).toBeChecked())
  })
})
