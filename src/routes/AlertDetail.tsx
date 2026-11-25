import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { ApiError } from '../api/client'
import type { AnomalyDetail as Detail } from '../api/anomalies'
import { ALERTS_PATH, deviceAlertsPath, devicePilotagePath, deviceReadingsPath, PULSE_PATH } from '../auth/paths'
import { anomalyCardContent, degreesToKm, formatMeasure, isClosed, type AnomalyCardContent } from '../anomalies/anomalyCard'
import {
  AnomalyHeader,
  History,
  lotText,
  LotFact,
  PositionFact,
  Readings,
  ReferenceFact,
  Section,
  TimesFact,
  useAnomalyDetail,
} from '../anomalies/AnomalyDetailParts'
import { TransitionForm } from '../anomalies/TransitionForm'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { ShellBreadcrumb, type ShellBreadcrumbLevel } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageTitle } from '@/ui/patterns/shell-title'
import { Skeleton } from '@/ui/skeleton'
import { TooltipProvider } from '@/ui/tooltip'
import { cn } from '@/lib/utils'
import { AlertsContractGate } from './AlertsContractGate'
import type { AlertsLocationState } from './AlertsTable'

/** The measured value, the rule's threshold (a geofence's radius) and the excess, as three stat tiles. */
function Occurrence({ detail, card }: { detail: Detail; card: AnomalyCardContent }) {
  const geofence = card.rule?.kind === 'geofence'
  const unit = card.rule?.unit ?? detail.unit
  const threshold =
    detail.threshold === null ? null : geofence ? formatMeasure(degreesToKm(detail.threshold), 'km') : formatMeasure(detail.threshold, unit)
  const tiles = [
    { id: 'value', label: 'Valeur mesurée', text: card.measure },
    { id: 'threshold', label: geofence ? 'Rayon autorisé' : 'Seuil', text: threshold },
    { id: 'excess', label: 'Écart', text: card.excess },
  ].filter((tile): tile is { id: string; label: string; text: string } => tile.text !== null)
  return (
    <Section title="Ce qui s'est passé" testId="alert-occurrence" className="max-lg:order-1">
      {tiles.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="alert-occurrence-tiles">
          {tiles.map((tile) => (
            <li
              key={tile.id}
              className={cn('flex min-w-0 flex-col justify-center rounded-md border border-border px-3 py-2', tile.id === 'value' && 'max-sm:col-span-2')}
              data-testid={`alert-occurrence-${tile.id}`}
            >
              <span className="truncate text-xs text-muted-foreground">{tile.label}</span>
              <span
                className={cn(
                  'truncate text-lg font-semibold tabular-nums',
                  tile.id === 'excess' && (isClosed(detail.status) ? 'text-muted-foreground' : 'text-danger'),
                )}
              >
                {tile.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-1 text-sm">
        {detail.label && (
          <p data-testid="alert-rule">
            Règle <span className="text-muted-foreground">{detail.label}</span>
          </p>
        )}
        <TimesFact detail={detail} now={new Date()} />
      </div>
    </Section>
  )
}

function QuickLink({ to, children, testId }: { to: string; children: ReactNode; testId: string }) {
  return (
    <Button variant="outline" size="sm" className="justify-between" asChild>
      <Link to={to} data-testid={testId}>
        {children}
        <ArrowUpRight aria-hidden />
      </Link>
    </Button>
  )
}

function AlertBody({ contractId, anomalyKey }: { contractId: number; anomalyKey: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const listPath = (location.state as AlertsLocationState | null)?.listPath ?? ALERTS_PATH
  const { state, current, setUpdated, reloadDetail } = useAnomalyDetail(contractId, anomalyKey)
  const now = new Date()
  const card = current ? anomalyCardContent({ ...current }, { now }) : null

  const levels: ShellBreadcrumbLevel[] = [
    { label: 'Alertes', to: listPath, testId: 'breadcrumb-alerts' },
    { label: current && card ? `${card.title} · ${current.chipId}` : anomalyKey, testId: 'breadcrumb-alert' },
  ]
  const notFound = state.status === 'error' && !current && state.error instanceof ApiError && state.error.status === 404
  const hasTreatment = current !== null && (current.allowedTransitions.length > 0 || current.readOnlyReason !== null)
  const hasLot = current !== null && lotText(current) !== ''
  const hasPlace = current !== null && (current.position !== null || current.referencePoint !== null)

  return (
    <>
      <ShellPageTitle>
        <ShellBreadcrumb levels={levels} />
      </ShellPageTitle>

      {notFound && (
        <Empty data-testid="alert-not-found">
          <EmptyHeader>
            <EmptyDescription>Cette alerte n'existe pas ou n'appartient pas à ce contrat.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" asChild>
            <Link to={listPath}>Retour aux alertes</Link>
          </Button>
        </Empty>
      )}

      {!notFound && (
        <section aria-labelledby="anomaly-detail-title" className="flex min-w-0 flex-col" data-testid="alert-page">
          <AnomalyHeader detail={current} now={now} onBack={() => navigate(listPath)} layout="page" />

          {state.status === 'loading' && !current && (
            <div data-testid="alert-loading" role="status" aria-busy className="flex flex-col gap-3 border-t border-border pt-5">
              <span className="sr-only">Chargement de l'alerte…</span>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {state.status === 'error' && !current && (
            <Empty data-testid="alert-error">
              <EmptyHeader>
                <EmptyDescription>Impossible de charger cette alerte.</EmptyDescription>
              </EmptyHeader>
              <Button variant="outline" onClick={reloadDetail}>
                Réessayer
              </Button>
            </Empty>
          )}

          {current && card && (
            // Both columns flatten below lg (`contents`) and the sections follow their own `max-lg:order-*`:
            // what happened, readings, treatment, the device's facts, then the history.
            <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-x-10">
              <div className="flex min-w-0 flex-col max-lg:contents lg:col-span-7 xl:col-span-8">
                <Occurrence detail={current} card={card} />
                <Readings detail={current} kind={card.rule?.kind ?? null} className="max-lg:order-2" wide />
                {hasTreatment && (
                  <Section title="Traitement" testId="anomaly-treatment" className="max-lg:order-3">
                    <TransitionForm contractId={contractId} detail={current} onChanged={setUpdated} onReload={reloadDetail} />
                  </Section>
                )}
                <History detail={current} now={now} className="max-lg:order-8" />
              </div>
              <div className="flex min-w-0 flex-col max-lg:contents lg:col-span-5 xl:col-span-4">
                <Section
                  title="Device"
                  testId="alert-device"
                  className="max-lg:order-4"
                  action={
                    <Link to={devicePilotagePath(current.chipId)} className="text-sm text-primary-text hover:underline" data-testid="alert-device-link">
                      Voir le device →
                    </Link>
                  }
                >
                  <p className="min-w-0 truncate font-mono text-sm font-medium" title={current.chipId}>
                    {current.chipId}
                  </p>
                </Section>
                {hasLot && (
                  <Section title="Lot et palette" testId="alert-lot" className="max-lg:order-5">
                    <div className="text-sm">
                      <LotFact detail={current} />
                    </div>
                  </Section>
                )}
                {hasPlace && (
                  <Section title="Lieu" testId="alert-place" className="max-lg:order-6">
                    <div className="flex flex-col gap-1 text-sm">
                      <PositionFact detail={current} />
                      <ReferenceFact detail={current} card={card} />
                    </div>
                  </Section>
                )}
                <Section title="Actions rapides" testId="alert-actions" className="max-lg:order-7">
                  <div className="flex flex-col gap-2">
                    <QuickLink to={`${PULSE_PATH}?anomalie=${encodeURIComponent(current.anomalyKey)}`} testId="alert-action-map">
                      Voir sur la carte
                    </QuickLink>
                    <QuickLink to={`${PULSE_PATH}?palette=${encodeURIComponent(current.chipId)}`} testId="alert-action-pallet">
                      Voir la palette
                    </QuickLink>
                    <QuickLink to={deviceReadingsPath(current.chipId)} testId="alert-action-readings">
                      Relevés du device
                    </QuickLink>
                    <QuickLink to={deviceAlertsPath(current.chipId)} testId="alert-action-device-alerts">
                      Autres alertes du device
                    </QuickLink>
                  </div>
                </Section>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}

/**
 * One alert's own page (PAT-DETAIL, `/alertes/:anomalyKey`): the Pulse drawer's content (`AnomalyDetailParts`)
 * on a grid-12 body. Main column: what happened, readings, treatment, history; side column: the device, lot,
 * position and quick links. The back button (and the breadcrumb's "Alertes") returns to the list with the
 * filters it came from. An alert the server doesn't know in this contract (404) gets its own not-found state.
 */
export function AlertDetail() {
  const { anomalyKey = '' } = useParams<{ anomalyKey: string }>()
  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Alerte</h1>
      <TooltipProvider>
        <div className="flex flex-col gap-6 p-4 md:p-6">
          <AlertsContractGate>
            {(contractId) => <AlertBody key={`${contractId}/${anomalyKey}`} contractId={contractId} anomalyKey={anomalyKey} />}
          </AlertsContractGate>
        </div>
      </TooltipProvider>
    </div>
  )
}
