import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { ApiError } from '../api/client'
import { fetchTrends, type TrendsResponse, type TrendsRisk } from '../api/trends'
import { TrendsChart } from './TrendsChart'
import { TrendsTable, trendsRowId } from './TrendsTable'
import { TrendsToolbar } from './TrendsToolbar'
import { DEFAULT_SORT, sortLots, type SortKey, type SortState } from './trendsData'

type State = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; data: TrendsResponse }
type Hover = { id: string; from: 'chart' | 'table' } | null

const CHART_BOX = 'h-9/20 min-h-75 max-h-130 shrink-0'

/** KAN-256 — one contract's Trends: toolbar, chart and table filling the viewport; point ↔ row hover/selection sync. */
export function TrendsWorkspace({ contractId, onUnauthorized }: { contractId: number; onUnauthorized: () => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover>(null)
  const [riskFilter, setRiskFilter] = useState<TrendsRisk | null>(null)
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState({ phase: 'loading' })
    setSelected(null)
    setRiskFilter(null)
    fetchTrends(contractId).then(
      (data) => live && setState({ phase: 'ready', data }),
      (err) => {
        if (!live) return
        if (err instanceof ApiError && err.status === 404) onUnauthorized()
        else setState({ phase: 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [contractId, attempt, onUnauthorized])

  useEffect(() => {
    if (selected) document.getElementById(trendsRowId(selected))?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const lots = useMemo(() => (state.phase === 'ready' ? state.data.lots : []), [state])
  const placed = useMemo(() => lots.filter((l) => l.placed), [lots])
  const rows = useMemo(
    () => sortLots(riskFilter ? placed.filter((l) => l.risk === riskFilter) : lots, sort),
    [lots, placed, riskFilter, sort],
  )

  const select = useCallback(
    (cpalLot: string) => {
      const lot = lots.find((l) => l.cpalLot === cpalLot)
      if (riskFilter && lot && lot.risk !== riskFilter) setRiskFilter(null)
      setSelected(cpalLot)
    },
    [lots, riskFilter],
  )
  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key === 'z' || key === 'risk' || key === 'velocity' }))

  if (state.phase === 'loading') {
    return (
      <div data-testid="trends-loading" role="status" aria-busy className="flex min-h-0 flex-1 flex-col gap-3">
        <span className="sr-only">Chargement des tendances…</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className={CHART_BOX} />
        <Skeleton className="min-h-48 flex-1" />
      </div>
    )
  }
  if (state.phase === 'error') {
    return (
      <Alert variant="danger" data-testid="trends-error">
        <AlertDescription>Impossible de charger les tendances.</AlertDescription>
        <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
          Réessayer
        </Button>
      </Alert>
    )
  }

  if (state.data.contract.contractType === 'STD') {
    return (
      <Empty data-testid="trends-std">
        <EmptyHeader>
          <EmptyDescription>
            Les lots sont suivis par le titulaire principal du contrat ; ce contrat partagé n'en affiche pas.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <TrendsToolbar summary={state.data.summary} riskFilter={riskFilter} onRiskFilter={setRiskFilter} />
      <div className={CHART_BOX}>
        {placed.length === 0 ? (
          <div data-testid="trends-empty" className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            Aucun lot actif
          </div>
        ) : (
          <TrendsChart
            lots={placed}
            riskFilter={riskFilter}
            selected={selected}
            hovered={hover?.from === 'table' ? hover.id : null}
            onHover={(id) => setHover(id ? { id, from: 'chart' } : null)}
            onSelect={select}
          />
        )}
      </div>
      {lots.length > 0 && (
        <div className="mt-10 min-h-0 flex-1 rounded-md border border-border">
          <TrendsTable
            lots={rows}
            sort={sort}
            onSort={onSort}
            selected={selected}
            hovered={hover?.from === 'chart' ? hover.id : null}
            onHover={(id) => setHover(id ? { id, from: 'table' } : null)}
            onSelect={select}
          />
        </div>
      )}
    </div>
  )
}
