import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import type { Data, Layout } from 'plotly.js'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { fetchContractHistory, type HistoryRow } from '../api/history'
import { formatAbsolute, formatCoordinates, formatLocalIso, formatMeasure, formatNumber } from '../anomalies/anomalyCard'
import { TYPE_ICON } from '../anomalies/AnomalyList'
import { useContracts } from '../contracts/ContractContext'
import { devicePilotagePath } from '../auth/paths'
import { formatIsoDate, validateDateRangeInputs } from '../history/dateRange'
import { dayRangeFromTimePicker } from '../history/timeRange'
import { useIsMobile } from '@/hooks/use-mobile'
import { Alert, AlertDescription } from '@/ui/alert'
import { Button } from '@/ui/button'
import { useChartTheme } from '@/ui/charts'
import { Plot } from '@/ui/charts/plot'
import { DataTable, type DataTableColumn } from '@/ui/data-table'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { MobileList } from '@/ui/mobile-list'
import { PeriodControl, SELECTED_TOGGLE, periodPresetOf } from '@/ui/patterns/period-control'
import { ShellPageActions } from '@/ui/patterns/shell-title'
import { resolveRange, type TimeRangeValue } from '@/ui/patterns/time-picker'
import { Skeleton } from '@/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'
import type { PilotageOutletContext } from './DevicePilotage'
import { Section } from './PilotageDeviceDetail'

/**
 * A device's full readings (`/pilotage/:chipId/releves`), a child page of its device page.
 *
 * PAT-DETAIL rhythm (ui-guidelines.md): the device header with a back button, then a grid-12 body — the
 * trend chart on 7–8 columns, the period summary tiles (min / max / last per measure, the "Dernier
 * relevé" tile style) on 5–4 — and the full readings table below, newest first, in the viewer's local
 * time. The period is the app's shared `PeriodControl` (top bar), 7 days by default. Data: the contract's
 * history endpoint (whole days, UTC) narrowed to this chip.
 */

const MEASURES = [
  { key: 'ta', label: 'Température', unit: '°C', icon: TYPE_ICON.temperature },
  { key: 'hr', label: 'Humidité', unit: '%HR', icon: TYPE_ICON.humidity },
  { key: 'm', label: 'Masse', unit: 'kg', icon: TYPE_ICON.mass },
  { key: 'g', label: 'Accélération', unit: 'g', icon: TYPE_ICON.shock },
] as const
type MeasureKey = (typeof MEASURES)[number]['key']

const DEFAULT_PERIOD: TimeRangeValue = { preset: '7d' }
const VIRTUALIZE_THRESHOLD = 50
/** Measured card height at 390 px (date line, measures line); real heights are measured. */
const MOBILE_CARD_PX = 66

type Load =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: HistoryRow[]; sampled: boolean; total: number }

function hasData(row: HistoryRow) {
  return MEASURES.some(({ key }) => row[key] !== null) || (row.p === 1 && row.la !== null && row.lo !== null)
}

/** The chip's readings of the range, newest first. */
function useDeviceReadings(contractId: number | null, chipId: string, start: Date, end: Date, reload: number): Load {
  const [state, setState] = useState<{ key: string; load: Load } | null>(null)
  const from = formatIsoDate(start)
  const to = formatIsoDate(end)
  const key = `${contractId}/${chipId}/${from}/${to}/${reload}`
  useEffect(() => {
    if (contractId === null) return
    let cancelled = false
    fetchContractHistory(contractId, { start, end })
      .then((history) => {
        if (cancelled) return
        const rows = history.rows.filter((row) => row.c === chipId && hasData(row)).sort((a, b) => b.t - a.t)
        setState({ key, load: { status: 'ready', rows, sampled: history.sampled, total: history.total } })
      })
      .catch(() => {
        if (!cancelled) setState({ key, load: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
    // `start`/`end` are new Date objects per render; `key` carries their values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, chipId, key])
  return state?.key === key ? state.load : { status: 'loading' }
}

interface Stat {
  min: number
  max: number
  last: number
}

/** Min / max / last (by time) of one measure; null when no row carries it. */
function statOf(rows: HistoryRow[], key: MeasureKey): Stat | null {
  let min = Infinity
  let max = -Infinity
  let last: number | null = null
  // `rows` are newest first: the first reading met is the last one.
  for (const row of rows) {
    const value = row[key]
    if (value === null) continue
    last ??= value
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return last === null ? null : { min, max, last }
}

function SummaryTiles({ rows }: { rows: HistoryRow[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2" data-testid="device-readings-summary">
      {MEASURES.map(({ key, label, unit, icon: Icon }) => {
        const stat = statOf(rows, key)
        const range = stat && `min ${formatNumber(stat.min, unit === 'kg' ? 0 : 1)} · max ${formatNumber(stat.max, unit === 'kg' ? 0 : 1)}`
        const rangeTitle = stat && `${label} : minimum ${formatMeasure(stat.min, unit)}, maximum ${formatMeasure(stat.max, unit)}`
        return (
          <li
            key={key}
            className="flex h-14 min-w-0 flex-col justify-center rounded-md border border-border px-2.5"
            data-testid={`device-readings-summary-${key}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium tabular-nums" title={`${label}, dernier relevé`}>
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="sr-only">{label}, dernier : </span>
              <span className="truncate">{stat ? formatMeasure(stat.last, unit) : '—'}</span>
            </span>
            <span className="truncate pl-5.5 text-xs text-muted-foreground" title={rangeTitle ?? `${label}, aucun relevé`}>
              {range ?? 'Aucun relevé'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** "2026-11-25 14:03:00" in the viewer's time zone: Plotly reads a bare stamp as the same wall clock. */
function localStamp(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const DAY_MS = 86_400_000

/**
 * French axis labels: Plotly's date axis prints English month names (the kit ships no locale), so ticks
 * are placed and labelled here. Under 2 days: hours ("14:00"); otherwise local midnights, about five of
 * them ("21 nov.").
 */
function axisTicks(first: number, last: number): { vals: string[]; text: string[] } {
  const vals: number[] = []
  if (last - first < 2 * DAY_MS) {
    const step = 3_600_000 * Math.max(1, Math.ceil((last - first) / 3_600_000 / 5))
    for (let t = Math.ceil(first / step) * step; t <= last; t += step) vals.push(t)
    const hour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
    return { vals: vals.map(localStamp), text: vals.map((t) => hour.format(t)) }
  }
  const stepDays = Math.max(1, Math.ceil((last - first) / DAY_MS / 5))
  const day = new Date(first)
  day.setHours(24, 0, 0, 0)
  for (; day.getTime() <= last; day.setDate(day.getDate() + stepDays)) vals.push(day.getTime())
  const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  return { vals: vals.map(localStamp), text: vals.map((t) => label.format(t)) }
}

function ReadingsTrend({ points, measure, label }: { points: HistoryRow[]; measure: (typeof MEASURES)[number]; label: string }) {
  const theme = useChartTheme()
  const style = theme.seriesStyle(0)
  const y = points.map((row) => row[measure.key])
  const stamps = points.map((row) => localStamp(row.t))
  const ticks = axisTicks(points[0].t, points[points.length - 1].t)
  const data: Data[] = [
    {
      type: 'scatter',
      mode: 'lines',
      x: stamps,
      y,
      customdata: points.map((row) => formatAbsolute(new Date(row.t))),
      line: { color: theme.colors[style.colorIndex], width: 2, dash: style.dash, shape: 'spline', smoothing: 0.4 },
      hovertemplate: `%{y:.1f} ${measure.unit}<br>%{customdata}<extra></extra>`,
    },
  ]
  const layout: Partial<Layout> = {
    ...theme.layout,
    showlegend: false,
    xaxis: { ...theme.layout.xaxis, fixedrange: false, tickmode: 'array', tickvals: ticks.vals, ticktext: ticks.text },
    yaxis: { ...theme.layout.yaxis, ticksuffix: ` ${measure.unit}`, fixedrange: false },
    margin: { l: 56, r: 12, t: 12, b: 36 },
  }
  return <Plot label={label} className="h-56 w-full" data={data} layout={layout} />
}

function TrendChart({ rows, chipId }: { rows: HistoryRow[]; chipId: string }) {
  const available = MEASURES.filter(({ key }) => rows.some((row) => row[key] !== null))
  const [chosen, setChosen] = useState<MeasureKey>('ta')
  const measure = available.find(({ key }) => key === chosen) ?? available[0]
  if (!measure) return <p className="text-sm text-muted-foreground">Aucune mesure à tracer sur la période.</p>
  const points = rows.filter((row) => row[measure.key] !== null).reverse()
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="device-readings-chart">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={measure.key}
        onValueChange={(next) => next && setChosen(next as MeasureKey)}
        aria-label="Mesure du graphique"
        className="w-fit bg-muted"
      >
        {available.map(({ key, label }) => (
          <ToggleGroupItem key={key} value={key} className={SELECTED_TOGGLE} data-testid={`device-readings-chart-${key}`}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ReadingsTrend points={points} measure={measure} label={`${measure.label} de ${chipId} sur la période`} />
    </div>
  )
}

const EM_DASH = (
  <span aria-hidden className="text-muted-foreground">
    —
  </span>
)

function measureText(value: number | null, unit: string) {
  return value === null ? null : formatMeasure(value, unit)
}

function positionText(row: HistoryRow) {
  return row.p === 1 && row.la !== null && row.lo !== null ? formatCoordinates({ lat: row.la, lng: row.lo }) : null
}

function DateCell({ row, now }: { row: HistoryRow; now: Date }) {
  const date = new Date(row.t)
  return (
    <span className="whitespace-nowrap" title={formatLocalIso(date)}>
      {formatAbsolute(date, now)}
    </span>
  )
}

function buildColumns(now: Date): DataTableColumn<HistoryRow>[] {
  const measureColumns: DataTableColumn<HistoryRow>[] = MEASURES.map(({ key, label, unit }) => ({
    id: key,
    accessorFn: (row: HistoryRow) => row[key],
    header: `${label} (${unit})`,
    meta: { numeric: true },
    cell: ({ row }) => {
      const value = row.original[key]
      return value === null ? EM_DASH : formatNumber(value, unit === 'kg' ? 0 : 1)
    },
  }))
  return [
    {
      id: 'date',
      accessorFn: (row) => row.t,
      header: 'Date',
      cell: ({ row }) => <DateCell row={row.original} now={now} />,
    },
    ...measureColumns,
    {
      id: 'position',
      header: 'Position',
      enableSorting: false,
      cell: ({ row }) => {
        const text = positionText(row.original)
        return text ? <span className="whitespace-nowrap tabular-nums">{text}</span> : EM_DASH
      },
    },
  ]
}

const rowKey = (row: HistoryRow) => `${row.c}-${row.t}`

function ReadingsTable({ rows }: { rows: HistoryRow[] }) {
  const isMobile = useIsMobile()
  const now = useMemo(() => new Date(), [])
  const columns = useMemo(() => buildColumns(now), [now])

  if (isMobile) {
    return (
      <MobileList<HistoryRow>
        items={rows}
        getKey={rowKey}
        label="Relevés"
        labels={{ count: (shown, total) => `${shown} sur ${total}`, showMore: 'Afficher plus' }}
        pageSize={VIRTUALIZE_THRESHOLD}
        windowThreshold={VIRTUALIZE_THRESHOLD}
        estimateItemPx={MOBILE_CARD_PX}
        listProps={{ 'data-testid': 'device-readings-list' } as ComponentProps<'ul'>}
        itemProps={(row) =>
          ({
            'data-testid': `device-reading-${row.t}`,
            className: 'flex flex-col gap-1 rounded-lg border border-border bg-card p-3',
          }) as ComponentProps<'li'>
        }
        renderItem={(row) => {
          const position = positionText(row)
          const values = MEASURES.map(({ key, unit }) => measureText(row[key], unit)).filter(Boolean)
          return (
            <>
              <span className="text-sm font-medium">
                <DateCell row={row} now={now} />
              </span>
              {values.length > 0 && <span className="text-xs tabular-nums">{values.join(' · ')}</span>}
              {position && <span className="text-xs text-muted-foreground tabular-nums">{position}</span>}
            </>
          )
        }}
      />
    )
  }

  return (
    <div data-testid={rows.length > VIRTUALIZE_THRESHOLD ? 'device-readings-list-scroll' : undefined}>
      <DataTable<HistoryRow>
        label="Relevés"
        columns={columns}
        data={rows}
        getRowId={rowKey}
        pageSize={VIRTUALIZE_THRESHOLD}
        virtualizeThreshold={VIRTUALIZE_THRESHOLD}
        emptyMessage="Aucun relevé sur la période."
        containerProps={{ 'data-testid': 'device-readings-list' } as ComponentProps<'div'>}
        rowProps={(row) => ({ 'data-testid': `device-reading-${row.t}`, className: 'bg-card' }) as ComponentProps<'tr'>}
      />
    </div>
  )
}

export function DeviceReadings() {
  const { chipId = '' } = useParams<{ chipId: string }>()
  const { devices } = useOutletContext<PilotageOutletContext>()
  const { selectedId } = useContracts()
  const navigate = useNavigate()
  const [period, setPeriod] = useState<TimeRangeValue>(DEFAULT_PERIOD)
  const [reload, setReload] = useState(0)

  const { start, end } = dayRangeFromTimePicker(period)
  const validation = validateDateRangeInputs(formatIsoDate(start), formatIsoDate(end))
  const load = useDeviceReadings(validation.ok ? selectedId : null, chipId, start, end, reload)
  const device = devices.find((candidate) => candidate.chipId === chipId)
  const back = () => navigate(devicePilotagePath(chipId))

  if (!device) {
    return (
      <Empty data-testid="pilotage-device-not-found">
        <EmptyHeader>
          <EmptyDescription>Aucun device « {chipId} » trouvé pour ce contrat.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const rows = load.status === 'ready' ? load.rows : []
  return (
    <section aria-labelledby="device-readings-title" className="flex min-w-0 flex-col" data-testid="device-readings-page">
      <ShellPageActions>
        <PeriodControl
          preset={periodPresetOf(period.preset)}
          range={resolveRange(period)}
          onPreset={(preset) => setPeriod({ preset })}
          onCustom={(from, to) => setPeriod({ preset: 'custom', from, to })}
          testId="time"
        />
      </ShellPageActions>

      <header className="flex min-w-0 flex-col gap-0.5 pb-3" data-testid="device-readings-header">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 shrink-0"
            aria-label="Retour au device"
            title="Retour au device"
            onClick={back}
            data-testid="device-readings-back"
          >
            <ArrowLeft aria-hidden />
          </Button>
          <h2 id="device-readings-title" className="min-w-0 truncate text-base font-semibold" data-testid="device-readings-title">
            Relevés · <span className="font-mono">{chipId}</span>
          </h2>
        </div>
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-testid="device-readings-subtitle">
          <span className="truncate">
            {formatAbsolute(resolveRange(period).from)} – {formatAbsolute(resolveRange(period).to)}
          </span>
          {load.status === 'ready' && (
            <>
              <span aria-hidden>·</span>
              <span data-testid="device-readings-count">
                {rows.length} {rows.length > 1 ? 'relevés' : 'relevé'}
              </span>
            </>
          )}
        </p>
      </header>

      {!validation.ok && (
        <Alert variant="danger" data-testid="device-readings-range-error">
          <AlertDescription>{validation.error.message}</AlertDescription>
        </Alert>
      )}

      {validation.ok && load.status === 'loading' && (
        <div data-testid="device-readings-loading" role="status" aria-busy className="flex flex-col gap-2 border-t border-border pt-5">
          <span className="sr-only">Chargement des relevés…</span>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )}

      {validation.ok && load.status === 'error' && (
        <Alert variant="danger" data-testid="device-readings-error">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Impossible de charger les relevés. Réessayez plus tard.
            <Button variant="outline" size="sm" onClick={() => setReload((n) => n + 1)} data-testid="device-readings-retry">
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {load.status === 'ready' && rows.length === 0 && (
        <div className="border-t border-border pt-5">
          <Empty data-testid="device-readings-empty">
            <EmptyHeader>
              <EmptyDescription>Aucun relevé pour ce device sur la période. Élargissez la période.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      )}

      {load.status === 'ready' && rows.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-x-10">
            <div className="flex min-w-0 flex-col max-lg:order-2 lg:col-span-7 xl:col-span-8">
              <Section title="Tendance" testId="device-readings-trend-section">
                <TrendChart rows={rows} chipId={chipId} />
              </Section>
            </div>
            <div className="flex min-w-0 flex-col max-lg:order-1 lg:col-span-5 xl:col-span-4">
              <Section title="Synthèse de la période" testId="device-readings-summary-section">
                <SummaryTiles rows={rows} />
                <p className="text-xs text-muted-foreground">Dernier relevé, minimum et maximum sur la période.</p>
              </Section>
            </div>
          </div>
          <Section title="Relevés" testId="device-readings-table-section">
            {load.sampled && (
              <p className="text-xs text-muted-foreground" data-testid="device-readings-sampled">
                Période très dense : {load.total} relevés au total, seul un échantillon est affiché.
              </p>
            )}
            <ReadingsTable rows={rows} />
          </Section>
        </>
      )}
    </section>
  )
}
