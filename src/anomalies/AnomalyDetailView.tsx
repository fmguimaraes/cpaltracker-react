import { SkeletonRows } from '@/ui/patterns/skeleton-rows'
import { useEffect, useRef, type ReactNode } from 'react'
import { anomalyCardContent } from './anomalyCard'
import {
  AnomalyHeader,
  History,
  LotFact,
  PositionFact,
  Readings,
  ReferenceFact,
  Section,
  ThresholdFact,
  TimesFact,
  useAnomalyDetail,
} from './AnomalyDetailParts'
import { TransitionForm } from './TransitionForm'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import type { AnomalyDetail as Detail } from '../api/anomalies'

function Context({ detail, now, onShowPallet }: { detail: Detail; now: Date; onShowPallet?: (chipId: string) => void }) {
  const card = anomalyCardContent({ ...detail }, { now })
  return (
    <Section
      title="Contexte"
      testId="anomaly-context"
      action={
        onShowPallet && (
          <Button
            variant="link"
            size="sm"
            className="h-auto shrink-0 p-0 text-sm"
            onClick={() => onShowPallet(detail.chipId)}
            data-testid="anomaly-show-pallet"
          >
            Voir la palette →
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-1 text-sm">
        <ThresholdFact detail={detail} card={card} />
        <TimesFact detail={detail} now={now} />
        <LotFact detail={detail} />
        <PositionFact detail={detail} />
        <ReferenceFact detail={detail} card={card} />
      </div>
    </Section>
  )
}

/**
 * KAN-261 (FR9, FR12, FR13) + owner redesign 2026-11-25: one anomaly, aligned with its card and the pallet
 * drawer. A two-line header (back, type icon, the card's title and excess, the host's `actions`; then status,
 * chip, measurement time), then Contexte, Relevés, Traitement and Historique sections; only the data present
 * is shown, rule codes only in tooltips, times local. `onLocate` receives the reading's position once the
 * detail is loaded (null when it has none), and null on back/unmount, so the host can zoom its main map on
 * the anomaly; `onShowPallet` ("Voir la palette →") opens the pallet's drawer. The pieces live in
 * `AnomalyDetailParts`, shared with the full page (`routes/AlertDetail`).
 */
export function AnomalyDetailView({
  contractId,
  anomalyKey,
  onBack,
  onLocate,
  onShowPallet,
  actions,
  now: fixedNow,
}: {
  contractId: number
  anomalyKey: string
  onBack: () => void
  onLocate?: (position: { lat: number; lng: number } | null) => void
  onShowPallet?: (chipId: string) => void
  /** The host's controls (the drawer's collapse button), at the right end of row 1. */
  actions?: ReactNode
  /** Reference instant for the relative times (tests). */
  now?: Date
}) {
  const { state, current, setUpdated, reloadDetail } = useAnomalyDetail(contractId, anomalyKey)
  // The latest callback, so an inline `onLocate` doesn't re-fire the effects below on every render.
  const locate = useRef(onLocate)
  useEffect(() => {
    locate.current = onLocate
  })
  const loaded = state.status === 'ready' ? state.value : null
  useEffect(() => {
    if (loaded) locate.current?.(loaded.position)
  }, [loaded])
  useEffect(() => () => locate.current?.(null), [])
  const back = () => {
    locate.current?.(null)
    onBack()
  }

  const now = fixedNow ?? new Date()
  const card = current ? anomalyCardContent({ ...current }, { now }) : null
  const hasTreatment = current !== null && (current.allowedTransitions.length > 0 || current.readOnlyReason !== null)

  return (
    <section aria-labelledby="anomaly-detail-title" className="flex min-w-0 flex-col" data-testid="anomaly-detail">
      <AnomalyHeader detail={current} now={now} onBack={back} actions={actions} />

      {state.status === 'loading' && !current ? <SkeletonRows label="Chargement de l'anomalie…" rows={1} rowClassName="h-48" surface="card" testId="anomaly-detail-loading" /> : null}
      {state.status === 'error' && !current ? (
        <Empty data-testid="anomaly-detail-error">
          <EmptyHeader>
            <EmptyDescription>Impossible de charger cette anomalie.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={reloadDetail}>
            Réessayer
          </Button>
        </Empty>
      ) : null}
      {current ? (
        <>
          <Context detail={current} now={now} onShowPallet={onShowPallet} />
          <Readings detail={current} kind={card?.rule?.kind ?? null} />
          {hasTreatment && (
            <Section title="Traitement" testId="anomaly-treatment">
              <TransitionForm contractId={contractId} detail={current} onChanged={setUpdated} onReload={reloadDetail} />
            </Section>
          )}
          <History detail={current} now={now} />
        </>
      ) : null}
    </section>
  )
}
