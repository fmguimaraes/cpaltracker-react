import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as anomaliesApi from '../api/anomalies'
import type { AnomalyRow } from '../api/anomalies'
import { ContractAnomalies, STATUS_TAB_KEY, toggleType } from './ContractAnomalies'

function row(anomalyKey: string, chipId: string, overrides: Partial<AnomalyRow> = {}): AnomalyRow {
  return {
    anomalyKey,
    status: 'detectee',
    code: 'TH',
    label: 'Température >= 19 °C',
    threshold: 19,
    value: 19.5,
    excess: 0.5,
    unit: '°C',
    eventDate: '2026-11-05 21:57:00',
    detectedAt: '2026-11-19 15:34:02.120',
    chipId,
    lot: null,
    ...overrides,
  }
}

/** The contract-1 demo rows: two open, one `fermee`, one `cloturee`. */
const DEMO = [
  row('1-3', 'DEMO-CHIP-001'),
  row('1-4', 'DEMO-CHIP-001', { status: 'en_cours', code: 'HH', unit: '%HR', threshold: 75, value: 80 }),
  row('1-5', 'DEMO-CHIP-001', { status: 'fermee', code: 'GH', unit: 'g', threshold: 5, value: 6.2 }),
  row('1-6', 'DEMO-CHIP-002', { status: 'cloturee', code: 'TL', threshold: 5, value: 2 }),
]

const rowKeys = () => screen.queryAllByTestId(/^anomaly-row-/).map((li) => li.dataset.testid?.replace('anomaly-row-', ''))

describe('ContractAnomalies', () => {
  beforeEach(() => {
    window.localStorage.clear()
    // Hovering a chip opens its tooltip, whose positioning observes the trigger's size.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('loads every status once and lists the open ones by default', async () => {
    const fetchList = vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(DEMO)
    render(<ContractAnomalies contractId={1} onOpen={() => {}} />)

    expect(await screen.findByTestId('anomaly-row-1-3')).toBeInTheDocument()
    expect(fetchList).toHaveBeenCalledTimes(1)
    expect(fetchList).toHaveBeenCalledWith(1, ['detectee', 'en_cours', 'fermee', 'cloturee'])
    expect(screen.getByRole('tablist', { name: 'Filtrer par statut' })).toBeInTheDocument()
    expect(screen.getByTestId('anomaly-tab-open')).toHaveAttribute('aria-selected', 'true')
  })

  it('"Ouvertes" never shows a closed anomaly, fermee included (spec §7 regression)', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(DEMO)
    render(<ContractAnomalies contractId={1} onOpen={() => {}} />)

    await screen.findByTestId('anomaly-row-1-3')
    expect(rowKeys()).toEqual(['1-3', '1-4'])
    expect(screen.queryByTestId('anomaly-row-1-5')).not.toBeInTheDocument()
    expect(screen.queryByTestId('anomaly-row-1-6')).not.toBeInTheDocument()
  })

  it('shows live counts on the tabs and switches with one click or the arrow keys; the tab is remembered', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(DEMO)
    const { unmount } = render(<ContractAnomalies contractId={1} onOpen={() => {}} />)
    const user = userEvent.setup()

    await screen.findByTestId('anomaly-row-1-3')
    expect(screen.getByTestId('anomaly-tab-count-open')).toHaveTextContent('2')
    expect(screen.getByTestId('anomaly-tab-count-closed')).toHaveTextContent('2')
    expect(screen.getByTestId('anomaly-tab-count-all')).toHaveTextContent('4')

    await user.click(screen.getByTestId('anomaly-tab-closed'))
    expect(rowKeys().sort()).toEqual(['1-5', '1-6'])
    expect(window.localStorage.getItem(STATUS_TAB_KEY)).toBe('closed')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByTestId('anomaly-tab-all')).toHaveAttribute('aria-selected', 'true')
    expect(rowKeys()).toEqual(['1-3', '1-4', '1-5', '1-6'])
    unmount()

    render(<ContractAnomalies contractId={1} onOpen={() => {}} />)
    await screen.findByTestId('anomaly-row-1-6')
    expect(screen.getByTestId('anomaly-tab-all')).toHaveAttribute('aria-selected', 'true')
  })

  it('every card states its status in a pill: "À traiter", "En cours", "Clôturée"; no unread dot', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(DEMO)
    window.localStorage.setItem(STATUS_TAB_KEY, 'all')
    render(<ContractAnomalies contractId={1} onOpen={() => {}} />)

    await screen.findByTestId('anomaly-row-1-3')
    expect(screen.getByTestId('anomaly-status-1-3')).toHaveTextContent('À traiter')
    expect(screen.getByTestId('anomaly-status-1-4')).toHaveTextContent('En cours')
    expect(screen.getByTestId('anomaly-status-1-5')).toHaveTextContent('Clôturée')
    expect(screen.getByTestId('anomaly-status-1-6')).toHaveTextContent('Clôturée')
    expect(screen.queryByRole('img', { name: 'Nouvelle anomalie' })).not.toBeInTheDocument()
    expect(screen.getByTestId('contract-anomalies')).not.toHaveTextContent('Détectée')
    expect(screen.getByTestId('contract-anomalies')).not.toHaveTextContent('Fermée')
  })

  it('shows the type chips only from 5 anomalies; a click isolates a type, all-off reverts to all', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([
      row('t1', 'a'),
      row('t2', 'a'),
      row('h1', 'a', { code: 'HH', unit: '%HR' }),
      row('g1', 'a', { code: 'GH', unit: 'g' }),
      row('l1', 'a', { code: 'LF', unit: '°', threshold: 0.05, value: 0.65 }),
      row('c1', 'a', { code: 'GH', status: 'cloturee' }),
    ])
    render(<ContractAnomalies contractId={1} onOpen={() => {}} />)
    const user = userEvent.setup()

    const chips = await screen.findByRole('group', { name: 'Filtrer par type' })
    // Only the types present in the tab, each with its count; the closed GH row is not counted.
    expect(within(chips).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Température (2)',
      'Humidité (1)',
      'Choc (1)',
      'Hors zone (1)',
    ])
    expect(within(chips).getAllByRole('button').every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true)

    await user.click(screen.getByTestId('anomaly-type-humidity'))
    expect(rowKeys()).toEqual(['h1'])
    expect(screen.getByTestId('anomaly-type-temperature')).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByTestId('anomaly-type-temperature'))
    expect(rowKeys().sort()).toEqual(['h1', 't1', 't2'])

    await user.click(screen.getByTestId('anomaly-type-temperature'))
    await user.click(screen.getByTestId('anomaly-type-humidity'))
    expect(rowKeys()).toHaveLength(5)

    // Fewer than 5 in the tab: no chip row.
    await user.click(screen.getByTestId('anomaly-tab-closed'))
    expect(screen.queryByTestId('anomaly-type-filter')).not.toBeInTheDocument()
  })

  it('toggleType: isolate from all, toggle after, none left = all', () => {
    expect(toggleType(null, 'shock')).toEqual(new Set(['shock']))
    expect(toggleType(new Set(['shock']), 'humidity')).toEqual(new Set(['shock', 'humidity']))
    expect(toggleType(new Set(['shock']), 'shock')).toBeNull()
  })

  it('a tab with nothing says so, per tab', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-6', 'a', { status: 'cloturee' })])
    render(<ContractAnomalies contractId={1} onOpen={() => {}} />)
    expect(await screen.findByText('Aucune anomalie ouverte')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId('anomaly-tab-closed'))
    expect(screen.getByTestId('anomaly-row-1-6')).toBeInTheDocument()
  })

  it('without onSelect a card opens the detail', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-2', 'dev-a'), row('3-2', 'dev-b')])
    const onOpen = vi.fn()
    render(<ContractAnomalies contractId={4} onOpen={onOpen} />)

    expect(await screen.findByTestId('anomaly-row-1-2')).toHaveTextContent('dev-a')
    await userEvent.setup().click(screen.getByTestId('anomaly-card-3-2'))
    expect(onOpen).toHaveBeenCalledWith('3-2')
  })

  it('with onSelect, a click (or Enter) reports the selection; no intermediate detail link', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-2', 'dev-a')])
    const onSelect = vi.fn()
    const onOpen = vi.fn()
    const { rerender } = render(<ContractAnomalies contractId={4} onSelect={onSelect} onOpen={onOpen} />)
    const user = userEvent.setup()

    const card = await screen.findByTestId('anomaly-card-1-2')
    expect(card).toHaveAttribute('aria-pressed', 'false')
    card.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith({ anomalyKey: '1-2', chipId: 'dev-a' })

    rerender(<ContractAnomalies contractId={4} selectedKey="1-2" onSelect={onSelect} onOpen={onOpen} />)
    expect(screen.getByTestId('anomaly-card-1-2')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Voir le détail')).not.toBeInTheDocument()
  })

  it('reports the hovered card’s device, and null when the pointer leaves', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-2', 'dev-a')])
    const onHover = vi.fn()
    render(<ContractAnomalies contractId={4} onHover={onHover} onOpen={() => {}} />)
    const user = userEvent.setup()

    await user.hover(await screen.findByTestId('anomaly-card-1-2'))
    expect(onHover).toHaveBeenLastCalledWith('dev-a')
    await user.unhover(screen.getByTestId('anomaly-card-1-2'))
    expect(onHover).toHaveBeenLastCalledWith(null)
  })

  it('with a chipId, shows only that device and drops the chip ID from its cards', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-2', 'dev-a'), row('3-2', 'dev-b')])
    render(<ContractAnomalies contractId={4} chipId="dev-b" onOpen={() => {}} />)

    expect(await screen.findByTestId('anomaly-row-3-2')).toBeInTheDocument()
    expect(screen.queryByTestId('anomaly-row-1-2')).not.toBeInTheDocument()
    expect(screen.getByTestId('anomaly-row-3-2')).not.toHaveTextContent('dev-b')
    expect(screen.getByTestId('anomaly-tab-count-open')).toHaveTextContent('1')
  })

  it('with visibleChipIds, lists and counts only the devices in the map viewport', async () => {
    vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-2', 'dev-a'), row('3-2', 'dev-b')])
    const { rerender } = render(
      <ContractAnomalies contractId={4} visibleChipIds={new Set(['dev-b'])} onOpen={() => {}} />,
    )
    expect(await screen.findByTestId('anomaly-row-3-2')).toBeInTheDocument()
    expect(screen.queryByTestId('anomaly-row-1-2')).not.toBeInTheDocument()
    expect(screen.getByTestId('anomaly-tab-count-open')).toHaveTextContent('1')

    rerender(<ContractAnomalies contractId={4} onOpen={() => {}} />)
    expect(screen.getByTestId('anomaly-row-1-2')).toBeInTheDocument()
    expect(screen.getByTestId('anomaly-tab-count-open')).toHaveTextContent('2')
  })

  describe('viewport scope (visible = in the map viewport, total = on the map)', () => {
    const ROWS = [
      row('1-1', 'dev-a'),
      row('1-2', 'dev-b'),
      row('1-3', 'dev-c'),
      row('1-4', 'dev-c', { status: 'cloturee' }),
      // dev-z has no position in the period: never in the scope total.
      row('1-9', 'dev-z'),
    ]
    const ON_MAP = new Set(['dev-a', 'dev-b', 'dev-c'])

    it('shows "Zone affichée · {visible} sur {total}" while some of the tab is out of view, and hides it when all is in view', async () => {
      vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(ROWS)
      const onShowAll = vi.fn()
      const { rerender } = render(
        <ContractAnomalies contractId={4} visibleChipIds={new Set(['dev-a'])} mapChipIds={ON_MAP} onShowAll={onShowAll} onOpen={() => {}} />,
      )
      const bar = await screen.findByTestId('anomaly-scope-bar')
      expect(within(bar).getByTestId('anomaly-scope-count')).toHaveTextContent('Zone affichée · 1 sur 3')
      // Above the tabs, consistent with the tab count (the listed cards).
      expect(bar.compareDocumentPosition(screen.getByTestId('anomaly-status-filter')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(screen.getByTestId('anomaly-tab-count-open')).toHaveTextContent('1')
      expect(rowKeys()).toEqual(['1-1'])

      await userEvent.click(within(bar).getByRole('button', { name: 'Tout afficher' }))
      expect(onShowAll).toHaveBeenCalledTimes(1)

      // The counts follow the tab: "Toutes" has dev-c's closed anomaly too.
      await userEvent.click(screen.getByTestId('anomaly-tab-all'))
      expect(screen.getByTestId('anomaly-scope-count')).toHaveTextContent('Zone affichée · 1 sur 4')

      rerender(<ContractAnomalies contractId={4} visibleChipIds={ON_MAP} mapChipIds={ON_MAP} onShowAll={onShowAll} onOpen={() => {}} />)
      expect(screen.queryByTestId('anomaly-scope-bar')).not.toBeInTheDocument()
      expect(rowKeys()).toHaveLength(4)
    })

    it('never shows the bar without a viewport filter (pallet panel, Live pages)', async () => {
      vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(ROWS)
      render(<ContractAnomalies contractId={4} onOpen={() => {}} />)
      expect(await screen.findByTestId('anomaly-row-1-1')).toBeInTheDocument()
      expect(screen.queryByTestId('anomaly-scope-bar')).not.toBeInTheDocument()
    })

    it('when every anomaly is out of view, says how many are elsewhere and offers "Tout afficher"', async () => {
      vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue(ROWS)
      const onShowAll = vi.fn()
      render(<ContractAnomalies contractId={4} visibleChipIds={new Set()} mapChipIds={ON_MAP} onShowAll={onShowAll} onOpen={() => {}} />)
      const empty = await screen.findByTestId('anomaly-list-empty')
      expect(empty).toHaveAttribute('data-reason', 'viewport')
      expect(empty).toHaveTextContent('Aucune anomalie dans la zone affichée · 3 ailleurs')
      expect(screen.queryByText(/Aucune anomalie ouverte/)).not.toBeInTheDocument()
      // The empty state carries the button; no second one in a scope bar.
      expect(screen.queryByTestId('anomaly-scope-bar')).not.toBeInTheDocument()
      await userEvent.click(within(empty).getByRole('button', { name: 'Tout afficher' }))
      expect(onShowAll).toHaveBeenCalledTimes(1)
    })

    it('with no anomaly on the map at all, says there is none over the period', async () => {
      vi.spyOn(anomaliesApi, 'fetchAnomalies').mockResolvedValue([row('1-9', 'dev-z')])
      render(<ContractAnomalies contractId={4} visibleChipIds={new Set()} mapChipIds={ON_MAP} onShowAll={() => {}} onOpen={() => {}} />)
      const empty = await screen.findByTestId('anomaly-list-empty')
      expect(empty).toHaveAttribute('data-reason', 'period')
      expect(empty).toHaveTextContent('Aucune anomalie ouverte sur la période')
      expect(within(empty).queryByRole('button', { name: 'Tout afficher' })).not.toBeInTheDocument()

      await userEvent.click(screen.getByTestId('anomaly-tab-all'))
      expect(screen.getByTestId('anomaly-list-empty')).toHaveTextContent('Aucune anomalie sur la période')
    })
  })

  it('shows an error with a retry', async () => {
    const fetchList = vi.spyOn(anomaliesApi, 'fetchAnomalies').mockRejectedValueOnce(new Error('boom'))
    fetchList.mockResolvedValue([row('1-2', 'dev-a')])
    render(<ContractAnomalies contractId={4} onOpen={() => {}} />)

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByTestId('anomaly-row-1-2')).toBeInTheDocument()
  })
})
