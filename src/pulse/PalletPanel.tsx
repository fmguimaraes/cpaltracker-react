import { Fragment, useCallback, useMemo, type ReactNode } from 'react'
import { ArrowLeft, SquareArrowOutUpRight, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { PlotMouseEvent } from 'plotly.js'
import { fetchAnomalies, peekAnomalies, type AnomalyRow } from '../api/anomalies'
import { devicePilotagePath } from '../auth/paths'
import { fetchContractHistory, type HistoryHook } from '../api/history'
import type { Position } from '../api/positions'
import { formatAbsolute, formatLocalIso, formatMeasure, formatRelative, isClosed } from '../anomalies/anomalyCard'
import { statusesForFilter } from '../anomalies/anomalyFormat'
import { useLoad } from '../anomalies/useLoad'
import { Button } from '@/ui/button'
import { Plot } from '@/ui/charts/plot'
import { useChartTheme } from '@/ui/charts'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  BLOCK_CLASSES,
  blockHeader,
  buildPalletFigure,
  FIGURE_HEIGHT_CLASS,
  palletExtent,
  type AnomalyPointData,
  type FigureMeasure,
  type TextMeasure,
} from './palletFigure'
import {
  anomaliesInRange,
  coverageNote,
  expectedInterval,
  isStale,
  PALLET_MEASURES,
  palletSeries,
  type PalletMeasureKey,
} from './palletSeries'
import { isOngoingHook, palletLotHooks, palletPeriodStats, type PalletPeriodStats } from './palletPeriod'

const ALL_STATUSES = statusesForFilter('all')

/** Row 2's context: contract, product, lot — whichever exist. */
export function palletSubtitle(contractRef: string | null, lot: Position['lot']): string {
  const lotName = lot?.custLotNumber?.trim() || lot?.cpalLot || null
  return [contractRef && `contrat ${contractRef}`, lot?.productName?.trim() || null, lotName && `lot ${lotName}`]
    .filter(Boolean)
    .join(' · ')
}

/** "3 anomalies →". */
export function anomaliesPillLabel(count: number): string {
  return `${count} ${count > 1 ? 'anomalies' : 'anomalie'} →`
}

/**
 * Pulse side panel for one pallet (owner redesign 2026-11-25, compact header + legible charts): a
 * two-line header (back, identity, its anomalies of the period, the drawer's own controls; then context
 * and time since the last reading, flagged when overdue), then its four measures over `range` as one
 * aligned figure (`buildPalletFigure`) with the thresholds of its own anomalies and their dots. The
 * anomaly list itself lives in the drawer only. Under the charts (unified shell, ported from Historique):
 * a "Période" section (readings, temperature range, Δ24h per metric) and the pallet's lot attach history,
 * each rendered only when it has data.
 */
export function PalletPanel({
  contractId,
  position,
  range,
  periodKey = '',
  onBack,
  onOpenAnomaly,
  onShowAnomalies,
  actions,
  now,
}: {
  contractId: number
  position: Position
  range: { from: Date; to: Date }
  /** The period choice (e.g. `7j`), not its resolved instants: names the data the charts show. */
  periodKey?: string
  onBack: () => void
  /** A click on an anomaly dot. */
  onOpenAnomaly?: (anomalyKey: string) => void
  /** The anomaly pill: the anomalies drawer, filtered on this pallet. */
  onShowAnomalies?: () => void
  /** The host's controls (the drawer's collapse button), at the right end of row 1. */
  actions?: ReactNode
  /** Reference instant for the relative time and the staleness (tests). */
  now?: Date
}) {
  const { chipId, lot } = position
  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  // Keyed on the instants, not the Date objects, so a parent re-creating `range` does not re-fetch.
  const loadHistory = useCallback(
    // This pallet's readings only: a whole large contract is slow, and too heavy for the API past a month.
    () => fetchContractHistory(contractId, { start: new Date(fromMs), end: new Date(toMs) }, chipId),
    [contractId, fromMs, toMs, chipId],
  )
  // The key is the entity and the period choice, never the resolved instants: a preset's refresh moves them every
  // time and keeps the charts (FR27), while another period never shows the previous period's charts.
  const { state, reload } = useLoad(loadHistory, undefined, `${contractId}:${chipId}:${periodKey}`)
  const loadAnomalies = useCallback(() => fetchAnomalies(contractId, ALL_STATUSES), [contractId])
  // KAN-345 (FR24): reopening the panel shows the cached alerts at once while they are revalidated.
  const peekAnomalyRows = useCallback(() => peekAnomalies(contractId, ALL_STATUSES), [contractId])
  const { state: anomalyState } = useLoad(loadAnomalies, peekAnomalyRows, String(contractId))

  const anomalies = useMemo<AnomalyRow[]>(
    () => (anomalyState.status === 'ready' ? anomalyState.value.filter((row) => row.chipId === chipId) : []),
    [anomalyState, chipId],
  )
  const inPeriod = useMemo(
    () => anomaliesInRange(anomalies, { from: new Date(fromMs), to: new Date(toMs) }),
    [anomalies, fromMs, toMs],
  )

  const series = useMemo<FigureMeasure[] | null>(() => {
    if (state.status !== 'ready') return null
    const span = { from: new Date(fromMs), to: new Date(toMs) }
    return PALLET_MEASURES.map((measure) => ({ measure, data: palletSeries(state.value.rows, chipId, measure.key, span) }))
  }, [state, chipId, fromMs, toMs])
  const charts = series?.filter(({ data }) => data.values.length > 0).length ?? 0
  const note = useMemo(() => {
    if (!series) return null
    const span = { from: new Date(fromMs), to: new Date(toMs) }
    return coverageNote(palletExtent(series, anomalies, span), span)
  }, [series, anomalies, fromMs, toMs])

  const reference = now ?? new Date()
  const contractRef = state.status === 'ready' ? state.value.contract.ContratRef : null
  const subtitle = palletSubtitle(contractRef, lot)
  const last = position.timestamp ? new Date(position.timestamp) : null
  const validLast = last && !Number.isNaN(last.getTime()) ? last : null
  const expected = state.status === 'ready' ? expectedInterval(state.value.rows, chipId) : null
  const stale = validLast !== null && isStale(validLast, reference, expected)
  const anyOpen = inPeriod.some((row) => !isClosed(row.status))
  const period = useMemo(
    () => (state.status === 'ready' ? palletPeriodStats(state.value.rows, chipId, { from: new Date(fromMs), to: new Date(toMs) }) : null),
    [state, chipId, fromMs, toMs],
  )
  const hooks = useMemo(() => (state.status === 'ready' ? palletLotHooks(state.value.hooks ?? [], chipId) : []), [state, chipId])

  return (
    <section aria-labelledby="pallet-panel-title" data-testid="pallet-panel" className="flex min-w-0 flex-col gap-1">
      <header className="flex min-w-0 flex-col gap-0.5" data-testid="pallet-header">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 shrink-0"
            aria-label="Retour aux anomalies"
            title="Retour aux anomalies"
            onClick={onBack}
            data-testid="pallet-back"
          >
            <ArrowLeft aria-hidden />
          </Button>
          <h2 id="pallet-panel-title" className="min-w-0 truncate text-base font-semibold" title={chipId}>
            {chipId}
          </h2>
          <Button asChild variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
            <Link
              to={`${devicePilotagePath(chipId)}?contrat_id=${contractId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ouvrir la page du device ${chipId} dans un nouvel onglet`}
              title="Ouvrir la page du device dans un nouvel onglet"
              data-testid="pallet-device-page"
            >
              <SquareArrowOutUpRight aria-hidden />
            </Link>
          </Button>
          {inPeriod.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'shrink-0 rounded-full tabular-nums',
                anyOpen ? 'bg-danger-soft text-danger' : 'bg-muted text-muted-foreground',
              )}
              title="Voir les anomalies de la palette sur la période"
              onClick={onShowAnomalies}
              data-testid="pallet-anomalies-link"
            >
              {anomaliesPillLabel(inPeriod.length)}
            </Button>
          )}
          {actions && <div className="ml-auto flex shrink-0 items-center">{actions}</div>}
        </div>
        {(subtitle || validLast) && (
          <p className="truncate text-xs text-muted-foreground" data-testid="pallet-subtitle" title={subtitle || undefined}>
            {subtitle}
            {subtitle && validLast && ' · '}
            {validLast && (
              <span
                className={cn(stale && 'font-medium text-warning')}
                title={`${formatAbsolute(validLast, reference)} (${formatLocalIso(validLast)})`}
                data-testid="pallet-last-report"
                data-stale={stale}
              >
                {stale && <TriangleAlert className="mr-0.5 inline size-3 align-text-top" aria-label="Relevé en retard" />}
                Dernier relevé {formatRelative(validLast, reference)}
              </span>
            )}
          </p>
        )}
      </header>

      {note && (
        <p className="text-xs text-muted-foreground" data-testid="pallet-coverage">
          {note}
        </p>
      )}

      {state.status === 'loading' && (
        <div role="status" data-testid="pallet-loading" className="flex flex-col gap-3 pt-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton surface="card" className="h-4 w-1/3" />
              <Skeleton surface="card" className="h-24 w-full" />
            </div>
          ))}
          <span className="sr-only">Chargement des mesures…</span>
        </div>
      )}

      {state.status === 'error' && (
        <Empty data-testid="pallet-error">
          <EmptyHeader>
            <EmptyDescription>Impossible de charger les mesures de la palette.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={reload}>
            Réessayer
          </Button>
        </Empty>
      )}

      {series && charts === 0 && (
        <Empty data-testid="pallet-empty">
          <EmptyHeader>
            <EmptyDescription>Aucune mesure de cette palette sur la période.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {series && charts > 0 && (
        <>
          <PalletCharts measures={series} charts={charts} anomalies={anomalies} range={range} now={reference} onOpenAnomaly={onOpenAnomaly} />
          {anomalyState.status === 'error' && (
            <p className="text-xs text-muted-foreground" data-testid="pallet-anomalies-error">
              Seuils et anomalies indisponibles.
            </p>
          )}
          {state.status === 'ready' && state.value.sampled && (
            <p className="text-xs text-muted-foreground">Mesures échantillonnées sur la période.</p>
          )}
        </>
      )}

      {period && <PeriodSection stats={period} />}
      {hooks.length > 0 && <LotHooksSection hooks={hooks} now={reference} />}
    </section>
  )
}

function PanelSection({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section aria-label={title} data-testid={testId} className="mt-3 flex min-w-0 flex-col gap-2 border-t border-border pt-3">
      <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

/** Readings, temperature range and Δ24h of the pallet over the period. */
function PeriodSection({ stats }: { stats: PalletPeriodStats }) {
  return (
    <PanelSection title="Période" testId="pallet-period">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
        <dt className="text-muted-foreground">Relevés</dt>
        <dd data-testid="pallet-period-count">{stats.count.toLocaleString('fr-FR')}</dd>
        {stats.temperature && (
          <>
            <dt className="text-muted-foreground">Température</dt>
            <dd data-testid="pallet-period-temperature">
              {formatMeasure(stats.temperature.min, '°C')} – {formatMeasure(stats.temperature.max, '°C')}
            </dd>
          </>
        )}
        {stats.deltas.map((delta) => (
          <Fragment key={delta.key}>
            <dt className="text-muted-foreground">Δ24h {delta.label.toLowerCase()}</dt>
            <dd data-testid={`pallet-period-delta-${delta.key}`}>{formatMeasure(delta.delta, delta.unit, true)}</dd>
          </Fragment>
        ))}
      </dl>
    </PanelSection>
  )
}

/** The pallet's lot attach history ("accrochage de lot"), local times, most recent first. */
function LotHooksSection({ hooks, now }: { hooks: HistoryHook[]; now: Date }) {
  return (
    <PanelSection title="Historique des lots" testId="pallet-lot-hooks">
      <ul className="flex flex-col gap-1.5 text-sm">
        {hooks.map((hook, index) => {
          const from = new Date(hook.from)
          const ongoing = isOngoingHook(hook, now)
          const to = new Date(hook.to)
          return (
            <li key={`${hook.lot}-${hook.from}-${index}`} className="flex min-w-0 flex-col" data-testid={`pallet-lot-hook-${index}`}>
              <span className="truncate font-medium">
                Lot {hook.cust?.trim() || String(hook.lot)}
                {hook.cust?.trim() && <span className="font-normal text-muted-foreground"> · cPAL {String(hook.lot)}</span>}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                <time dateTime={formatLocalIso(from)} title={formatLocalIso(from)}>
                  {formatAbsolute(from, now)}
                </time>
                {' – '}
                {ongoing ? (
                  'en cours'
                ) : (
                  <time dateTime={formatLocalIso(to)} title={formatLocalIso(to)}>
                    {formatAbsolute(to, now)}
                  </time>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </PanelSection>
  )
}

/** The metric's line colour (`--chart-n`, the figure's `theme.colors[n - 1]`), as a Tailwind class. */
const CHIP_CLASS: Record<PalletMeasureKey, string> = { ta: 'bg-chart-1', hr: 'bg-chart-2', g: 'bg-chart-3', m: 'bg-chart-4' }

let canvas: OffscreenCanvas | null = null

/** Canvas width of a 10 px y label in the chart font; null where there is no canvas (jsdom: estimate instead). */
function canvasMeasure(fontFamily: string): TextMeasure | undefined {
  if (typeof OffscreenCanvas === 'undefined') return undefined
  canvas ??= new OffscreenCanvas(1, 1)
  const context = canvas.getContext('2d')
  if (!context) return undefined
  context.font = `10px ${fontFamily || 'sans-serif'}`
  return (text) => context.measureText(text).width
}

function PalletCharts({
  measures,
  charts,
  anomalies,
  range,
  now,
  onOpenAnomaly,
}: {
  measures: FigureMeasure[]
  charts: number
  anomalies: AnomalyRow[]
  range: { from: Date; to: Date }
  now: Date
  onOpenAnomaly?: (anomalyKey: string) => void
}) {
  const theme = useChartTheme()
  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  // `now` only formats the tooltips: to the minute, so the figure is not rebuilt on every render.
  const minute = Math.floor(now.getTime() / 60_000)
  const figure = useMemo(
    () =>
      buildPalletFigure({
        measures,
        anomalies,
        range: { from: new Date(fromMs), to: new Date(toMs) },
        theme,
        now: new Date(minute * 60_000),
        measureText: canvasMeasure(theme.fontSans),
      }),
    [measures, anomalies, fromMs, toMs, theme, minute],
  )
  const openDot = (event: Readonly<PlotMouseEvent>) => {
    const point = event.points.find((p) => Array.isArray(p.customdata))
    if (point) onOpenAnomaly?.((point.customdata as unknown as AnomalyPointData)[1])
  }
  const label = `Mesures de la palette sur la période : ${measures.map(({ measure }) => measure.label).join(', ')}`
  const reference = new Date(minute * 60_000)
  return (
    <div data-testid="pallet-charts" data-rows={charts} className={cn('relative w-full', FIGURE_HEIGHT_CLASS[charts])}>
      <Plot label={label} className="absolute inset-0" data={figure.data} layout={figure.layout} onClick={openDot} />
      {/* Block headers over the figure, in the same px rhythm (BLOCK_CLASSES = GEOMETRY): the plots stay
          Plotly's, so the shared axis and crosshair are untouched; only the value takes the pointer. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col">
        {measures.map((block, index) => {
          const { label: name, value, title } = blockHeader(block, reference)
          const hasData = block.data.values.length > 0
          return (
            <div
              key={block.measure.key}
              data-testid={`pallet-block-${block.measure.key}`}
              className={cn(
                'flex flex-col',
                BLOCK_CLASSES.padTop,
                index < measures.length - 1 && BLOCK_CLASSES.padBottom,
                // The 1 px divider overlaps the block above's padding, so the rhythm stays on the 4 px grid.
                index > 0 && '-mt-px border-t border-border',
              )}
            >
              <div className={cn('flex min-w-0 items-baseline justify-between gap-2', BLOCK_CLASSES.header, BLOCK_CLASSES.gap)}>
                <span className="flex min-w-0 items-baseline gap-1.5 text-xs font-semibold tracking-wider text-foreground">
                  <span aria-hidden className={cn('size-2 shrink-0 self-center rounded-xs', CHIP_CLASS[block.measure.key])} />
                  <span className="truncate">{name}</span>
                </span>
                <span
                  className={cn(
                    'pointer-events-auto shrink-0 text-lg leading-5 font-bold tabular-nums',
                    !hasData && 'text-muted-foreground',
                  )}
                  title={title ?? undefined}
                  data-testid={`pallet-value-${block.measure.key}`}
                >
                  {value}
                </span>
              </div>
              {hasData ? (
                <div aria-hidden className={BLOCK_CLASSES.plot} />
              ) : (
                <p className={cn('flex items-center text-xs text-muted-foreground', BLOCK_CLASSES.empty)}>Aucun relevé</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
