import { useCallback, useState } from 'react'
import { fetchAnomalyDetail, type AnomalyDetail as Detail } from '../api/anomalies'
import { formatCoordinates, formatMoment, formatValue, STATUS_LABEL, STATUS_TONE } from './anomalyFormat'
import { TransitionForm } from './TransitionForm'
import { useLoad } from './useLoad'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="col-span-6 flex flex-col" data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

function Facts({ detail }: { detail: Detail }) {
  const { readings, lot } = detail
  return (
    <dl className="grid grid-cols-12 gap-3" data-testid="anomaly-facts">
      <Fact label="Règle au moment de la détection">{detail.rule}</Fact>
      <Fact label="Seuil">{formatValue(detail.threshold, detail.unit)}</Fact>
      <Fact label="Valeur mesurée">{formatValue(detail.value, detail.unit)}</Fact>
      <Fact label="Device">{detail.chipId}</Fact>
      <Fact label="Date de la mesure">{formatMoment(detail.eventDate)}</Fact>
      <Fact label="Détectée le">{formatMoment(detail.detectedAt)}</Fact>
      <Fact label="Lot client">{lot?.custLotNumber ?? '—'}</Fact>
      <Fact label="Lot cPAL">{lot?.cpalLot ?? '—'}</Fact>
      <Fact label="Produit">{lot?.productName ?? '—'}</Fact>
      <Fact label="Température">{formatValue(readings.temperature, '°C')}</Fact>
      <Fact label="Humidité">{formatValue(readings.humidity, '%HR')}</Fact>
      <Fact label="Masse">{formatValue(readings.mass, 'kg')}</Fact>
      <Fact label="Accélération">{formatValue(readings.acceleration, 'g')}</Fact>
      <Fact label="Position" testId="anomaly-position">
        {detail.position ? formatCoordinates(detail.position) : 'Position non disponible'}
      </Fact>
      {detail.referencePoint ? (
        <Fact label="Point de référence">{formatCoordinates(detail.referencePoint)}</Fact>
      ) : null}
    </dl>
  )
}

function History({ detail }: { detail: Detail }) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Historique des statuts" data-testid="anomaly-history">
      {detail.history.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="text-sm" data-testid={`anomaly-history-${index}`}>
          <p className="font-medium">
            {STATUS_LABEL[entry.from]} → {STATUS_LABEL[entry.to]}
          </p>
          <p className="text-xs text-muted-foreground">
            {entry.by.name ?? 'Autre organisation'} · {formatMoment(entry.at)}
          </p>
          {entry.comment ? <p className="whitespace-pre-line">{entry.comment}</p> : null}
        </li>
      ))}
      <li className="text-sm" data-testid="anomaly-history-detected">
        <p className="font-medium">Détectée</p>
        <p className="text-xs text-muted-foreground">Système · {formatMoment(detail.detectedAt)}</p>
      </li>
    </ol>
  )
}

/** KAN-261 (FR9, FR12, FR13): one anomaly's frozen data, readings, lot, coordinates and status history. */
export function AnomalyDetail({
  contractId,
  anomalyKey,
  onBack,
}: {
  contractId: number
  anomalyKey: string
  onBack: () => void
}) {
  const load = useCallback(() => fetchAnomalyDetail(contractId, anomalyKey), [contractId, anomalyKey])
  const { state, reload } = useLoad(load)
  // After a transition the server's answer replaces the loaded detail until the next reload.
  const [updated, setUpdated] = useState<Detail | null>(null)
  const current = updated ?? (state.status === 'ready' ? state.value : null)
  const reloadDetail = () => {
    setUpdated(null)
    reload()
  }

  return (
    <div className="flex flex-col gap-4" data-testid="anomaly-detail">
      <Button variant="link" className="w-fit px-0" onClick={onBack} data-testid="anomaly-back">
        ← Retour à la liste
      </Button>
      {state.status === 'loading' && !current ? <Skeleton className="h-48 w-full" /> : null}
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
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium">
              {current.code} — {current.label}
            </h3>
            <Badge variant={STATUS_TONE[current.status]} data-testid="anomaly-status">
              {STATUS_LABEL[current.status]}
            </Badge>
          </div>
          {current.lastChange ? (
            <p className="text-xs text-muted-foreground" data-testid="anomaly-last-change">
              Dernier changement par {current.lastChange.by.name ?? 'Autre organisation'} le{' '}
              {formatMoment(current.lastChange.at)}
            </p>
          ) : null}
          <TransitionForm
            contractId={contractId}
            detail={current}
            onChanged={setUpdated}
            onReload={reloadDetail}
          />
          <Facts detail={current} />
          <h4 className="text-sm font-medium">Historique</h4>
          <History detail={current} />
        </>
      ) : null}
    </div>
  )
}
