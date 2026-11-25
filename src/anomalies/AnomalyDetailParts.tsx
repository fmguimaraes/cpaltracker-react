import { useCallback, useState, type ReactNode } from 'react'
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
  type AnomalyCardContent,
  type RuleKind,
} from './anomalyCard'
import { DETAIL_STATUS_LABEL, formatDelay } from './anomalyFormat'
import { AnomalyLifecycle } from './AnomalyLifecycle'
import { TYPE_ICON } from './AnomalyList'
import { StatusPill } from './StatusPill'
import { useLoad } from './useLoad'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * The pieces of one anomaly's view, shared by the Pulse drawer (`AnomalyDetailView`) and the full page
 * (`routes/AlertDetail`): the header, the labelled sections and the facts they hold. Each host only decides
 * the arrangement (one narrow column, or a grid-12 body).
 */

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

/** Loads one anomaly's detail; after a transition the server's answer replaces it until the next reload. */
export function useAnomalyDetail(contractId: number, anomalyKey: string) {
  const load = useCallback(() => fetchAnomalyDetail(contractId, anomalyKey), [contractId, anomalyKey])
  const { state, reload } = useLoad(load)
  const [updated, setUpdated] = useState<Detail | null>(null)
  const current = updated ?? (state.status === 'ready' ? state.value : null)
  const reloadDetail = () => {
    setUpdated(null)
    reload()
  }
  return { state, current, setUpdated, reloadDetail }
}

/** A local time ("14 nov. 09:00"), the full local ISO timestamp in its tooltip. */
export function Moment({ date, now, relative = false, testId }: { date: Date; now: Date; relative?: boolean; testId?: string }) {
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
export function Section({
  title,
  testId,
  action,
  className,
  children,
}: {
  title: string
  testId: string
  className?: string
  /** Optional: a link or button right-aligned on the title row. */
  action?: ReactNode
  children: ReactNode
}) {
  const heading = <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h3>
  return (
    <section className={cn('flex min-w-0 flex-col gap-2 border-t border-border pt-5 pb-4', className)} aria-label={title} data-testid={testId}>
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


/** The lot's fields present, joined ("Lot client L-1 · Lot cPAL CP-1 · Produit Yaourt"); '' without a lot. */
export function lotText(detail: Detail): string {
  return [
    detail.lot?.custLotNumber?.trim() && `Lot client ${detail.lot.custLotNumber.trim()}`,
    detail.lot?.cpalLot?.trim() && `Lot cPAL ${detail.lot.cpalLot.trim()}`,
    detail.lot?.productName?.trim() && `Produit ${detail.lot.productName.trim()}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "Seuil 19 °C" (rule code only in its tooltip); null for a geofence, whose threshold is a radius. */
export function ThresholdFact({ detail, card }: { detail: Detail; card: AnomalyCardContent }) {
  const unit = card.rule?.unit ?? detail.unit
  if (card.rule?.kind === 'geofence' || detail.threshold === null) return null
  const ruleTooltip = [detail.rule, detail.label].filter(Boolean).join(' · ')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="w-fit" data-testid="anomaly-threshold">
          Seuil {formatMeasure(detail.threshold, unit)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{ruleTooltip}</TooltipContent>
    </Tooltip>
  )
}

/** "Mesurée 14 nov. 09:00 · détectée … +3 h": the measurement, the detection and a late-detection flag. */
export function TimesFact({ detail, now }: { detail: Detail; now: Date }) {
  const measured = parseUtc(detail.eventDate)
  const detected = parseUtc(detail.detectedAt)
  const delay = measured && detected ? detected.getTime() - measured.getTime() : 0
  if (!measured && !detected) return null
  return (
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
  )
}

export function LotFact({ detail }: { detail: Detail }) {
  const lot = lotText(detail)
  return lot ? <p data-testid="anomaly-lot">{lot}</p> : null
}

/** No place name is part of the data: the coordinates alone. */
export function PositionFact({ detail }: { detail: Detail }) {
  if (!detail.position) return null
  return (
    <p data-testid="anomaly-position">
      Position <span className="text-xs text-muted-foreground tabular-nums">{formatCoordinates(detail.position)}</span>
    </p>
  )
}

/** A geofence's reference point and radius in km (stored in degrees, never shown as such). */
export function ReferenceFact({ detail, card }: { detail: Detail; card: AnomalyCardContent }) {
  if (card.rule?.kind !== 'geofence') return null
  const radius = detail.threshold !== null ? formatMeasure(degreesToKm(detail.threshold), 'km') : null
  if (!detail.referencePoint && !radius) return null
  return (
    <p data-testid="anomaly-reference">
      Point de référence{' '}
      <span className="text-xs text-muted-foreground tabular-nums">
        {[detail.referencePoint && formatCoordinates(detail.referencePoint), radius && `rayon ${radius}`].filter(Boolean).join(' · ')}
      </span>
    </p>
  )
}

/**
 * The anomaly's header (PAT-DETAIL): row 1 back, type icon, the card's title and excess, the host's `actions`;
 * row 2 status · chip · measurement time; then the lifecycle bar. `layout="page"` keeps the bar at a readable
 * width on a wide page. Without `card` (still loading) only the back button and an sr-only title show.
 */
export function AnomalyHeader({
  detail,
  now,
  onBack,
  actions,
  layout = 'drawer',
}: {
  detail: Detail | null
  now: Date
  onBack: () => void
  actions?: ReactNode
  layout?: 'drawer' | 'page'
}) {
  const card = detail ? anomalyCardContent({ ...detail }, { now }) : null
  const Icon = TYPE_ICON[card?.rule?.kind ?? 'other']
  const measured = detail ? parseUtc(detail.eventDate) : null
  return (
    <header className="flex min-w-0 flex-col gap-0.5 pb-3" data-testid="anomaly-header">
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-2 shrink-0"
          aria-label="Retour à la liste"
          title="Retour à la liste"
          onClick={onBack}
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
      {detail && (
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-testid="anomaly-subtitle">
          <StatusPill status={detail.status} qualified data-testid="anomaly-status" />
          <span aria-hidden>·</span>
          <span className="min-w-0 truncate" title={detail.chipId}>
            {detail.chipId}
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
      {detail && (
        <div className={cn(layout === 'page' && 'max-w-3xl')}>
          <AnomalyLifecycle detail={detail} now={now} />
        </div>
      )}
    </header>
  )
}

export function Readings({ detail, kind, className, wide = false }: { detail: Detail; kind: RuleKind | null; className?: string; wide?: boolean }) {
  const tiles = READINGS.filter(({ key }) => detail.readings[key] !== null)
  if (tiles.length === 0) return null
  const severity = isClosed(detail.status) ? 'border-muted-foreground' : 'border-danger'
  return (
    <Section title="Relevés au moment de la mesure" testId="anomaly-readings" className={className}>
      <ul className={cn('grid grid-cols-2 gap-2', wide && 'sm:grid-cols-4')}>
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

export function History({ detail, now, className }: { detail: Detail; now: Date; className?: string }) {
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
    <Section title="Historique" testId="anomaly-history-section" className={className}>
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

