import { useMemo, type ComponentProps } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { AnomalyRow } from '../api/anomalies'
import { alertPath } from '../auth/paths'
import { anomalyCardContent, cardHeadline, formatAbsolute, formatLocalIso, formatRelative, isClosed, parseUtc } from '../anomalies/anomalyCard'
import { TYPE_ICON } from '../anomalies/AnomalyList'
import { StatusPill } from '../anomalies/StatusPill'
import { DataTable, type DataTableColumn } from '@/ui/data-table'
import { MobileList } from '@/ui/mobile-list'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/utils'

/** Windowing threshold, the same as the devices list. */
const VIRTUALIZE_THRESHOLD = 50
/** Measured card height at 390 px (status line, headline, device and lot, date); real heights are measured. */
const MOBILE_CARD_PX = 124

const MOBILE_LABELS = { count: (shown: number, total: number) => `${shown} sur ${total}`, showMore: 'Afficher plus' }

/** "Lot L-1 · Yaourt": the customer lot number, else the cPAL lot, then the product. */
export function lotSummary(row: AnomalyRow): string {
  const lot = row.lot?.custLotNumber?.trim() || row.lot?.cpalLot?.trim()
  return [lot, row.lot?.productName?.trim()].filter(Boolean).join(' · ')
}

/** The state the list hands to a detail page, so its back button returns to the same filters. */
export interface AlertsLocationState {
  listSearch?: string
}

function rowContent(row: AnomalyRow) {
  const card = anomalyCardContent(row)
  // The threshold (or a geofence's radius) is the card's last detail segment.
  const threshold = card.details.find((segment) => /^(seuil|rayon) /.test(segment)) ?? null
  const when = parseUtc(row.detectedAt)
  return { card, threshold, when, Icon: TYPE_ICON[card.rule?.kind ?? 'other'] }
}

function TypeCell({ row }: { row: AnomalyRow }) {
  const { card, Icon } = rowContent(row)
  const toHandle = row.status === 'detectee'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The row's keyboard entry: the whole row is clickable, this link is its focusable twin. */}
        <Link
          to={alertPath(row.anomalyKey)}
          className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-signal-ring"
          data-testid={`alert-link-${row.anomalyKey}`}
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className={cn('truncate', toHandle && 'font-semibold')}>{card.title}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>{card.ruleTooltip}</TooltipContent>
    </Tooltip>
  )
}

function ValueCell({ row }: { row: AnomalyRow }) {
  const { card, threshold } = rowContent(row)
  if (!card.measure) return <span aria-hidden className="text-muted-foreground">—</span>
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap tabular-nums" data-testid={`alert-value-${row.anomalyKey}`}>
      <span className="font-medium">{card.measure}</span>
      {threshold && <span className="text-xs text-muted-foreground">{threshold}</span>}
      {card.excess && <span className={cn('text-xs font-medium', isClosed(row.status) ? 'text-muted-foreground' : 'text-danger')}>{card.excess}</span>}
    </span>
  )
}

function DetectedCell({ row, className }: { row: AnomalyRow; className?: string }) {
  const { when } = rowContent(row)
  if (!when) return <span aria-hidden className="text-muted-foreground">—</span>
  const now = new Date()
  return (
    <time dateTime={formatLocalIso(when)} title={formatLocalIso(when)} className={cn('whitespace-nowrap text-muted-foreground', className)}>
      {formatRelative(when, now)} · {formatAbsolute(when, now)}
    </time>
  )
}

const columns: DataTableColumn<AnomalyRow>[] = [
  { id: 'status', header: 'Statut', accessorFn: (row) => row.status, cell: ({ row }) => <StatusPill status={row.original.status} /> },
  { id: 'type', header: 'Type', accessorFn: (row) => anomalyCardContent(row).title, cell: ({ row }) => <TypeCell row={row.original} /> },
  { id: 'device', header: 'Device', accessorKey: 'chipId', meta: { mono: true }, cell: ({ row }) => row.original.chipId },
  {
    id: 'lot',
    header: 'Lot · produit',
    accessorFn: lotSummary,
    cell: ({ row }) => lotSummary(row.original) || <span aria-hidden className="text-muted-foreground">—</span>,
  },
  { id: 'value', header: 'Valeur · seuil', accessorFn: (row) => row.value ?? -Infinity, cell: ({ row }) => <ValueCell row={row.original} /> },
  { id: 'detected', header: 'Détectée', accessorFn: (row) => row.detectedAt, cell: ({ row }) => <DetectedCell row={row.original} /> },
]

function DesktopTable({ rows }: { rows: AnomalyRow[] }) {
  const navigate = useNavigate()
  const { search } = useLocation()
  const open = (key: string) => navigate(alertPath(key), { state: { listSearch: search } satisfies AlertsLocationState })
  const tableColumns = useMemo(() => columns, [])
  return (
    <DataTable<AnomalyRow>
      label="Alertes"
      columns={tableColumns}
      data={rows}
      getRowId={(row) => row.anomalyKey}
      pageSize={VIRTUALIZE_THRESHOLD}
      virtualizeThreshold={VIRTUALIZE_THRESHOLD}
      emptyMessage="Aucune alerte."
      containerProps={{ 'data-testid': 'alerts-table' } as ComponentProps<'div'>}
      rowProps={(row) =>
        ({
          'data-testid': `alert-row-${row.anomalyKey}`,
          'data-status': row.status,
          className: cn('cursor-pointer bg-card', isClosed(row.status) && 'text-muted-foreground'),
          onClick: (event) => {
            if ((event.target as HTMLElement).closest('a')) return
            open(row.anomalyKey)
          },
        }) as ComponentProps<'tr'>
      }
    />
  )
}

function MobileCards({ rows }: { rows: AnomalyRow[] }) {
  const { search } = useLocation()
  return (
    <MobileList<AnomalyRow>
      items={rows}
      getKey={(row) => row.anomalyKey}
      label="Alertes"
      labels={MOBILE_LABELS}
      pageSize={VIRTUALIZE_THRESHOLD}
      windowThreshold={VIRTUALIZE_THRESHOLD}
      estimateItemPx={MOBILE_CARD_PX}
      listProps={{ 'data-testid': 'alerts-list' } as ComponentProps<'ul'>}
      itemProps={(row) => ({ 'data-testid': `alert-row-${row.anomalyKey}`, 'data-status': row.status }) as ComponentProps<'li'>}
      renderItem={(row) => {
        const { card, Icon } = rowContent(row)
        const lot = lotSummary(row)
        return (
          <Link
            to={alertPath(row.anomalyKey)}
            state={{ listSearch: search } satisfies AlertsLocationState}
            className={cn(
              'flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-signal-ring',
              isClosed(row.status) && 'text-muted-foreground',
            )}
            data-testid={`alert-link-${row.anomalyKey}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className={cn('min-w-0 truncate text-sm', row.status === 'detectee' ? 'font-semibold' : 'font-medium')}>{cardHeadline(card)}</span>
              {card.excess && <span className="shrink-0 text-xs font-medium tabular-nums">{card.excess}</span>}
              <StatusPill status={row.status} className="ml-auto" />
            </span>
            <span className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{row.chipId}</span>
              {lot && ` · ${lot}`}
            </span>
            <DetectedCell row={row} className="text-xs" />
          </Link>
        )
      }}
    />
  )
}

/** The alerts as the kit `DataTable` (md and up) or the kit `MobileList` (below md); one click opens an alert. */
export function AlertsTable({ rows, mobile }: { rows: AnomalyRow[]; mobile: boolean }) {
  return mobile ? <MobileCards rows={rows} /> : <DesktopTable rows={rows} />
}
