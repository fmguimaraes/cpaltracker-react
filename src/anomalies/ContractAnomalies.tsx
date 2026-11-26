import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import { fetchAnomalies, type AnomalyRow } from '../api/anomalies'
import { sortAnomalies, TYPE_LABEL, TYPE_ORDER, typeKeyOf, type TypeKey } from './anomalyCard'
import { STATUS_FILTER_OPTIONS, statusesForFilter, type StatusFilter } from './anomalyFormat'
import { AnomalyList, TYPE_ICON, type AnomalySelection } from './AnomalyList'
import { useLoad } from './useLoad'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { SkeletonRows } from '@/ui/patterns/skeleton-rows'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'

/** Every status, fetched once: the tabs and their counts are computed from the same rows. */
const ALL = statusesForFilter('all')

/** The type chips only show from this many anomalies in the current tab. */
const TYPE_CHIPS_MIN = 5

export const STATUS_TAB_KEY = 'cpal.anomalies.statusTab'

function readTab(): StatusFilter {
  try {
    const stored = window.localStorage.getItem(STATUS_TAB_KEY)
    return STATUS_FILTER_OPTIONS.some((option) => option.value === stored) ? (stored as StatusFilter) : 'open'
  } catch {
    return 'open'
  }
}

function writeTab(tab: StatusFilter) {
  try {
    window.localStorage.setItem(STATUS_TAB_KEY, tab)
  } catch {
    // Storage unavailable: the tab just isn't remembered.
  }
}

/**
 * The type chips' state: `null` = every type active (the default). From "all", a chip click isolates its
 * type; further clicks toggle types; when none is left, back to all.
 */
export function toggleType(active: ReadonlySet<TypeKey> | null, type: TypeKey): Set<TypeKey> | null {
  if (active === null) return new Set([type])
  const next = new Set(active)
  if (next.has(type)) next.delete(type)
  else next.add(type)
  return next.size === 0 ? null : next
}

/**
 * KAN-261 + owner redesign 2026-11-25: a contract's anomalies (the 200 most recent, every status loaded
 * once) with status tabs ("Ouvertes", "Clôturées", "Toutes", each with its count; the tab is remembered),
 * type chips (from 5 anomalies in the tab) and the cards. With `chipId`, only that device's anomalies;
 * with `visibleChipIds` (the map viewport), only those devices' — the counts follow both, so a count
 * always matches the list it opens. `onSelect`/`onHover`/`selectedKey` let the host drive its map;
 * `onOpen` opens the detail. No heading: the host provides it.
 *
 * Viewport scope (only with `visibleChipIds`): `total` = the rows of the current tab (and active type
 * chips) whose device is on the map (`mapChipIds`: positioned in the period/instant), before the viewport
 * filter; `visible` = the same rows inside the viewport, i.e. the listed cards. While some but not all are
 * in view, a scope bar above the tabs says "Zone affichée · {visible} sur {total}" with "Tout afficher"
 * (`onShowAll`: the host re-frames its map on every pallet, and the list follows the new viewport).
 */
export function ContractAnomalies({
  contractId,
  chipId,
  visibleChipIds,
  mapChipIds,
  onShowAll,
  selectedKey,
  onSelect,
  onHover,
  onOpen,
}: {
  contractId: number
  chipId?: string
  /** Map viewport filter (devices currently in view); `undefined` = no viewport filter. */
  visibleChipIds?: ReadonlySet<string>
  /** With `visibleChipIds`: the devices on the map wherever the view is (scope total); absent = every row's device. */
  mapChipIds?: ReadonlySet<string>
  /** With `visibleChipIds`: re-frame the map on every pallet ("Tout afficher"); absent = no such button. */
  onShowAll?: () => void
  selectedKey?: string | null
  onSelect?: (row: AnomalySelection) => void
  onHover?: (chipId: string | null) => void
  onOpen: (anomalyKey: string) => void
}) {
  const [tab, setTab] = useState<StatusFilter>(readTab)
  const [activeTypes, setActiveTypes] = useState<Set<TypeKey> | null>(null)
  const load = useCallback(() => fetchAnomalies(contractId, ALL), [contractId])
  const { state, reload } = useLoad(load)

  const view = useMemo(() => {
    const loaded = state.status === 'ready' ? state.value : []
    const ofDevice = chipId === undefined ? loaded : loaded.filter((row) => row.chipId === chipId)
    const inView = visibleChipIds === undefined ? ofDevice : ofDevice.filter((row) => visibleChipIds.has(row.chipId))
    // Client-side split by status: a closed row (fermee included) never lands under "Ouvertes".
    const byTab = (rows: AnomalyRow[], value: StatusFilter) => {
      const allowed = new Set(statusesForFilter(value))
      return rows.filter((row) => allowed.has(row.status))
    }
    const tabRows = byTab(inView, tab)
    const typeCounts = new Map<TypeKey, number>()
    for (const row of tabRows) {
      const key = typeKeyOf(row.code)
      typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1)
    }
    const showTypes = tabRows.length >= TYPE_CHIPS_MIN
    // The type filter only applies while its chips are on screen.
    const typeFiltered = showTypes && activeTypes !== null
    const ofType = (list: AnomalyRow[]) => (typeFiltered ? list.filter((row) => activeTypes.has(typeKeyOf(row.code))) : list)
    const rows = ofType(tabRows)
    // The scope total: the same rows before the viewport filter (devices on the map only).
    const onMap = mapChipIds === undefined ? ofDevice : ofDevice.filter((row) => mapChipIds.has(row.chipId))
    const total = visibleChipIds === undefined ? rows.length : ofType(byTab(onMap, tab)).length
    return {
      counts: Object.fromEntries(STATUS_FILTER_OPTIONS.map(({ value }) => [value, byTab(inView, value).length])) as Record<
        StatusFilter,
        number
      >,
      types: TYPE_ORDER.filter((key) => typeCounts.has(key)).map((key) => ({ key, count: typeCounts.get(key) ?? 0 })),
      showTypes,
      typeFiltered,
      rows: sortAnomalies(rows),
      scope: { visible: rows.length, total },
    }
  }, [state, chipId, visibleChipIds, mapChipIds, tab, activeTypes])

  const chooseTab = (value: string) => {
    const next = value as StatusFilter
    setTab(next)
    writeTab(next)
  }

  const scoped = visibleChipIds !== undefined
  const { visible, total } = view.scope
  // Every row of the tab is out of view: say how many are elsewhere, never "no anomaly".
  const outOfView = scoped && visible === 0 && total > 0
  const statusEmpty = STATUS_FILTER_OPTIONS.find((option) => option.value === tab)?.empty
  let emptyReason: 'type' | 'viewport' | 'period' | 'status' = 'status'
  let emptyText = statusEmpty
  if (view.typeFiltered) {
    emptyReason = 'type'
    emptyText = 'Aucune anomalie pour ce type'
  } else if (outOfView) {
    emptyReason = 'viewport'
    emptyText = `Aucune anomalie dans la zone affichée · ${total - visible} ailleurs`
  } else if (scoped) {
    emptyReason = 'period'
    emptyText = `${statusEmpty} sur la période`
  }
  const showAllButton = (testId: string) =>
    onShowAll && (
      <Button variant="link" size="sm" className="h-auto p-0" onClick={onShowAll} data-testid={testId}>
        Tout afficher
      </Button>
    )

  let body: ReactNode
  if (state.status === 'loading') body = <SkeletonRows label="Chargement des anomalies…" rows={4} className="gap-4" testId="anomaly-list-loading" />
  else if (state.status === 'error') {
    body = (
      <Empty data-testid="anomaly-list-error">
        <EmptyHeader>
          <EmptyDescription>Impossible de charger les anomalies.</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={reload}>
          Réessayer
        </Button>
      </Empty>
    )
  } else if (view.rows.length === 0) {
    body = (
      <Empty data-testid="anomaly-list-empty" data-reason={emptyReason}>
        <EmptyHeader>
          <EmptyDescription>{emptyText}</EmptyDescription>
        </EmptyHeader>
        {emptyReason === 'viewport' && showAllButton('anomaly-empty-show-all')}
        {view.typeFiltered && (
          <Button variant="link" onClick={() => setActiveTypes(null)} data-testid="anomaly-filters-reset">
            Réinitialiser les filtres
          </Button>
        )}
      </Empty>
    )
  } else {
    body = (
      <AnomalyList
        rows={view.rows}
        showName={chipId === undefined}
        selectedKey={selectedKey}
        onSelect={onSelect}
        onHover={onHover}
        onOpen={onOpen}
      />
    )
  }

  const ready = state.status === 'ready'
  // Some (not all, not none — the empty state says that) of the tab's anomalies are out of view.
  const showScopeBar = ready && scoped && visible > 0 && visible < total

  return (
    <TooltipProvider>
      <Tabs value={tab} onValueChange={chooseTab} className="flex min-w-0 flex-col gap-2" data-testid="contract-anomalies">
        {showScopeBar && (
          <div
            className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md bg-muted px-2.5 py-1.5 text-xs"
            data-testid="anomaly-scope-bar"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              <span className="tabular-nums" data-testid="anomaly-scope-count">
                Zone affichée · {visible} sur {total}
              </span>
            </span>
            {showAllButton('anomaly-scope-show-all')}
          </div>
        )}
        <TabsList className="w-full" aria-label="Filtrer par statut" data-testid="anomaly-status-filter">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value} data-testid={`anomaly-tab-${option.value}`}>
              {option.label}
              {ready && (
                <span className="tabular-nums" data-testid={`anomaly-tab-count-${option.value}`}>
                  {view.counts[option.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {ready && view.showTypes && (
          <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-1" data-testid="anomaly-type-filter">
            {view.types.map(({ key, count }) => {
              const Icon = TYPE_ICON[key]
              const pressed = activeTypes === null || activeTypes.has(key)
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={pressed ? 'secondary' : 'outline'}
                      size="xs"
                      aria-pressed={pressed}
                      aria-label={`${TYPE_LABEL[key]} (${count})`}
                      onClick={() => setActiveTypes((current) => toggleType(current, key))}
                      data-testid={`anomaly-type-${key}`}
                    >
                      <Icon aria-hidden />
                      <span className="tabular-nums">{count}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{TYPE_LABEL[key]}</TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )}

        {STATUS_FILTER_OPTIONS.map((option) => (
          <TabsContent key={option.value} value={option.value} className="min-w-0 pt-2">
            {option.value === tab ? body : null}
          </TabsContent>
        ))}
      </Tabs>
    </TooltipProvider>
  )
}
