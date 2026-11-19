import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/ui/alert'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { ApiError } from '../api/client'
import { fetchTrends, type TrendsResponse } from '../api/trends'
import { TrendsChart } from './TrendsChart'
import { TrendsTable, trendsRowId } from './TrendsTable'

type State = { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; data: TrendsResponse }

/** KAN-256 — one contract's Trends: loading, error (retry), STD, no lot, or chart + table. */
export function TrendsWorkspace({ contractId, onUnauthorized }: { contractId: number; onUnauthorized: () => void }) {
  const [state, setState] = useState<State>({ phase: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    setState({ phase: 'loading' })
    setSelected(null)
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

  const select = useCallback((cpalLot: string) => {
    setSelected(cpalLot)
    document.getElementById(trendsRowId(cpalLot))?.scrollIntoView({ block: 'nearest' })
  }, [])

  if (state.phase === 'loading') {
    return (
      <div data-testid="trends-loading" role="status" aria-busy className="flex flex-col gap-4">
        <span className="sr-only">Chargement des tendances…</span>
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-48 w-full" />
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

  const { contract, lots } = state.data
  if (contract.contractType === 'STD') {
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
  if (lots.length === 0) {
    return (
      <Empty data-testid="trends-empty">
        <EmptyHeader>
          <EmptyDescription>Aucun lot à afficher pour ce contrat.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <TrendsChart lots={lots} onSelect={select} />
      <TrendsTable lots={lots} selected={selected} />
    </div>
  )
}
