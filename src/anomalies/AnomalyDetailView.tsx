import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { fetchAnomalyDetail, isCommentEntry, type AnomalyDetail as Detail, type AnomalyHistoryEntry } from '../api/anomalies'
import {
  anomalyCardContent,
  cardHeadline,
  degreesToKm,
  formatAbsolute,
  formatCoordinates,
  formatLocalIso,
  formatMeasure,
  formatRelative,
  isClosed,
  parseUtc,
  type RuleKind,
} from './anomalyCard'
import { DETAIL_STATUS_LABEL, formatDelay } from './anomalyFormat'
import { AnomalyLifecycle } from './AnomalyLifecycle'
import { TYPE_ICON } from './AnomalyList'
import { StatusPill } from './StatusPill'
import { TransitionForm } from './TransitionForm'
import { useLoad } from './useLoad'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/utils'

/** Past this gap between the measurement and its detection, the delay is flagged. */
const DETECTION_DELAY_FLAG_MS = 3_600_000

/** History events shown before "Afficher tout". */
const HISTORY_PAGE = 5

type ReadingKey = keyof Detail['readings']

/** The readings tiles, in the 2 × 2 order of the drawer, with the rule kind each one triggers. */
const READINGS: { key: ReadingKey; label: string; unit: string; icon: (typeof TYPE_ICON)[keyof typeof TYPE_ICON]; kind: RuleKind }[] = [
  { key: 'temperature', label: 'Température', unit: '°C', icon: TYPE_ICON.temperature, kind: 'temperature' },
  { key: 'humidity', label: 'Humidité', unit: '%HR', icon: TYPE_ICON.humidity, kind: 'humidity' },
  { key: 'acceleration', label: 'Accélération', unit: 'g', icon: TYPE_ICON.shock, kind: 'shock' },
  { key: 'mass', label: 'Poids', unit: 'kg', icon: TYPE_ICON.mass, kind: 'mass' },
]

/** A local time ("14 nov. 09:00"), the full local ISO timestamp in its tooltip. */
function Moment({ date, now, relative = false, testId }: { date: Date; now: Date; relative?: boolean; testId?: string }) {
  const iso = formatLocalIso(date)
  const absolute = formatAbsolute(date, now)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={iso} data-testid={testId}>
          {relative ? `${formatRelative(date, now)} · ${absolute}` : absolute}
        </time>
      </TooltipTrigger>
      <TooltipContent>{iso}</TooltipContent>
    </Tooltip>
  )
}

/** The pallet drawer's rhythm: 1 px divider, 20 px top / 16 px bottom, 8 px under the title. */
function Section({
  title,
  testId,
  action,
  children,
}: {
  title: string
  testId: string
  /** Optional: a link or button right-aligned on the title row. */
  action?: ReactNode
  children: ReactNode
}) {
  const heading = <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h3>
  return (
    <section className="flex min-w-0 flex-col gap-2 border-t border-border pt-5 pb-4" aria-label={title} data-testid={testId}>
      {action ? (
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}

function Context({ detail, now, onShowPallet }: { detail: Detail; now: Date; onShowPallet?: (chipId: string) => void }) {
  const card = anomalyCardContent({ ...detail }, { now })
  const geofence = card.rule?.kind === 'geofence'
  const unit = card.rule?.unit ?? detail.unit
  const ruleTooltip = [detail.rule, detail.label].filter(Boolean).join(' · ')
  const measured = parseUtc(detail.eventDate)
  const detected = parseUtc(detail.detectedAt)
  const delay = measured && detected ? detected.getTime() - measured.getTime() : 0
  const lot = [
    detail.lot?.custLotNumber?.trim() && `Lot client ${detail.lot.custLotNumber.trim()}`,
    detail.lot?.cpalLot?.trim() && `Lot cPAL ${detail.lot.cpalLot.trim()}`,
    detail.lot?.productName?.trim() && `Produit ${detail.lot.productName.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ')
  // A geofence's threshold is its radius, in degrees: shown in km with the reference point instead.
  const threshold = !geofence && detail.threshold !== null ? formatMeasure(detail.threshold, unit) : null
  const radius = geofence && detail.threshold !== null ? formatMeasure(degreesToKm(detail.threshold), 'km') : null

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
        {threshold && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-fit" data-testid="anomaly-threshold">
                Seuil {threshold}
              </span>
            </TooltipTrigger>
            <TooltipContent>{ruleTooltip}</TooltipContent>
          </Tooltip>
        )}
        {(measured || detected) && (
          <p className="flex flex-wrap items-baseline gap-x-1" data-testid="anomaly-times">
            {measured && (
              <span>
                Mesurée <Moment date={measured} now={now} testId="anomaly-measured" />
              </span>
            )}
            {measured && detected && <span aria-hidden>·</span>}
            {detected && (
              <span>
                détectée <Moment date={detected} now={now} testId="anomaly-detected" />
              </span>
            )}
            {delay > DETECTION_DELAY_FLAG_MS && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 font-medium text-warning" data-testid="anomaly-delay">
                    <TriangleAlert className="size-3" aria-hidden />
                    {formatDelay(delay)}
                  </span>
                </TooltipTrigger>
                <TooltipContent>Délai entre la mesure et la détection</TooltipContent>
              </Tooltip>
            )}
          </p>
        )}
        {lot && <p data-testid="anomaly-lot">{lot}</p>}
        {detail.position && (
          // No place name is part of the data: the coordinates alone.
          <p data-testid="anomaly-position">
            Position <span className="text-xs text-muted-foreground tabular-nums">{formatCoordinates(detail.position)}</span>
          </p>
        )}
        {geofence && (detail.referencePoint || radius) && (
          <p data-testid="anomaly-reference">
            Point de référence{' '}
            <span className="text-xs text-muted-foreground tabular-nums">
              {[detail.referencePoint && formatCoordinates(detail.referencePoint), radius && `rayon ${radius}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </p>
        )}
      </div>
    </Section>
  )
}

function Readings({ detail, kind }: { detail: Detail; kind: RuleKind | null }) {
  const tiles = READINGS.filter(({ key }) => detail.readings[key] !== null)
  if (tiles.length === 0) return null
  const severity = isClosed(detail.status) ? 'border-muted-foreground' : 'border-danger'
  return (
    <Section title="Relevés au moment de la mesure" testId="anomaly-readings">
      <ul className="grid grid-cols-2 gap-2">
        {tiles.map(({ key, label, unit, icon: Icon, kind: tileKind }) => {
          const triggering = tileKind === kind
          return (
            <li
              key={key}
              className={cn(
                'flex h-14 min-w-0 flex-col justify-center rounded-md border border-border px-2.5',
                triggering && severity,
              )}
              data-testid={`anomaly-reading-${key}`}
              data-triggering={triggering}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium tabular-nums" title={label}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">{label} </span>
                <span className="truncate">{formatMeasure(detail.readings[key] as number, unit)}</span>
              </span>
              {triggering && detail.threshold !== null && (
                <span className="truncate pl-5.5 text-xs text-muted-foreground">seuil {formatMeasure(detail.threshold, unit)}</span>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function eventTitle(entry: AnomalyHistoryEntry): string {
  return isCommentEntry(entry) ? 'Commentaire' : `${DETAIL_STATUS_LABEL[entry.from]} → ${DETAIL_STATUS_LABEL[entry.to]}`
}

interface TimelineEvent {
  id: string
  kind: 'comment' | 'status' | 'detected'
  title: string
  author: string
  at: Date | null
  comment: string | null
}

function History({ detail, now }: { detail: Detail; now: Date }) {
  const [expanded, setExpanded] = useState(false)
  // Newest first, as the server sends them, then the detection itself.
  const events: TimelineEvent[] = [
    ...detail.history.map((entry, index) => ({
      id: String(index),
      kind: isCommentEntry(entry) ? ('comment' as const) : ('status' as const),
      title: eventTitle(entry),
      author: entry.by.name ?? 'Autre organisation',
      at: parseUtc(entry.at),
      comment: entry.comment,
    })),
    { id: 'detected', kind: 'detected', title: 'Détectée', author: 'Système', at: parseUtc(detail.detectedAt), comment: null },
  ]
  const shown = expanded ? events : events.slice(0, HISTORY_PAGE)
  return (
    <Section title="Historique" testId="anomaly-history-section">
      <ol className="flex flex-col" aria-label="Historique" data-testid="anomaly-history">
        {shown.map((event, index) => (
          <li
            key={event.id}
            className="relative flex gap-2.5 pb-3 last:pb-0"
            data-testid={`anomaly-history-${event.id}`}
            data-kind={event.kind}
          >
            {index < shown.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-1 w-px bg-border" />}
            <span
              aria-hidden
              className={cn('relative mt-1.5 size-2.5 shrink-0 rounded-full', event.kind === 'comment' ? 'bg-muted-foreground' : 'bg-signal')}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-semibold">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.author}
                {event.at && (
                  <>
                    {' · '}
                    <Moment date={event.at} now={now} relative />
                  </>
                )}
              </p>
              {event.comment && (
                <blockquote className="border-l-2 border-border pl-2 text-sm whitespace-pre-line text-muted-foreground">
                  {event.comment}
                </blockquote>
              )}
            </div>
          </li>
        ))}
      </ol>
      {!expanded && events.length > HISTORY_PAGE && (
        <Button
          variant="link"
          size="sm"
          className="h-auto w-fit p-0 text-sm"
          onClick={() => setExpanded(true)}
          data-testid="anomaly-history-all"
        >
          Afficher tout ({events.length})
        </Button>
      )}
    </Section>
  )
}

/**
 * KAN-261 (FR9, FR12, FR13) + owner redesign 2026-11-25: one anomaly, aligned with its card and the pallet
 * drawer. A two-line header (back, type icon, the card's title and excess, the host's `actions`; then status,
 * chip, measurement time), then Contexte, Relevés, Traitement and Historique sections; only the data present
 * is shown, rule codes only in tooltips, times local. `onLocate` receives the reading's position once the
 * detail is loaded (null when it has none), and null on back/unmount, so the host can zoom its main map on
 * the anomaly; `onShowPallet` ("Voir la palette →") opens the pallet's drawer.
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
  const load = useCallback(() => fetchAnomalyDetail(contractId, anomalyKey), [contractId, anomalyKey])
  const { state, reload } = useLoad(load)
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
  // After a transition the server's answer replaces the loaded detail until the next reload.
  const [updated, setUpdated] = useState<Detail | null>(null)
  const current = updated ?? (state.status === 'ready' ? state.value : null)
  const reloadDetail = () => {
    setUpdated(null)
    reload()
  }

  const now = fixedNow ?? new Date()
  const card = current ? anomalyCardContent({ ...current }, { now }) : null
  const Icon = TYPE_ICON[card?.rule?.kind ?? 'other']
  const measured = current ? parseUtc(current.eventDate) : null
  const hasTreatment = current !== null && (current.allowedTransitions.length > 0 || current.readOnlyReason !== null)

  return (
    <section aria-labelledby="anomaly-detail-title" className="flex min-w-0 flex-col" data-testid="anomaly-detail">
      <header className="flex min-w-0 flex-col gap-0.5 pb-3" data-testid="anomaly-header">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 shrink-0"
            aria-label="Retour à la liste"
            title="Retour à la liste"
            onClick={back}
            data-testid="anomaly-back"
          >
            <ArrowLeft aria-hidden />
          </Button>
          {card ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex shrink-0" data-testid="anomaly-type-icon">
                    <Icon className="size-4" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{card.ruleTooltip}</TooltipContent>
              </Tooltip>
              <h2 id="anomaly-detail-title" className="min-w-0 truncate text-base font-semibold" title={cardHeadline(card)} data-testid="anomaly-title">
                {cardHeadline(card)}
              </h2>
              {card.excess && (
                <span className="shrink-0 text-sm font-medium tabular-nums" data-testid="anomaly-excess">
                  {card.excess}
                </span>
              )}
            </>
          ) : (
            <h2 id="anomaly-detail-title" className="sr-only">
              Anomalie
            </h2>
          )}
          {actions && <div className="ml-auto flex shrink-0 items-center">{actions}</div>}
        </div>
        {current && (
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-testid="anomaly-subtitle">
            <StatusPill status={current.status} qualified data-testid="anomaly-status" />
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate" title={current.chipId}>
              {current.chipId}
            </span>
            {measured && (
              <>
                <span aria-hidden>·</span>
                <span className="shrink-0">
                  <Moment date={measured} now={now} testId="anomaly-subtitle-time" />
                </span>
              </>
            )}
          </p>
        )}
        {current && <AnomalyLifecycle detail={current} now={now} />}
      </header>

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
