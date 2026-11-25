import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'
import type { TrendsLot } from '../api/trends'
import {
  RISK_META,
  formatExpiry,
  formatNumber,
  formatRatio,
  formatZ,
  type SortKey,
  type SortState,
} from './trendsData'

export const trendsRowId = (cpalLot: string) => `trends-row-${cpalLot}`

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'lot', label: 'Lot client' },
  { key: 'expiry', label: 'Péremption' },
  { key: 'balance', label: 'Solde', numeric: true },
  { key: 'velocity', label: 'Vitesse (réf. → requise)', numeric: true },
  { key: 'z', label: 'z', numeric: true },
  { key: 'risk', label: 'Risque' },
]

function TwoLines({ main, sub, className }: { main: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col leading-tight', className)}>
      <span>{main}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

export interface TrendsTableProps {
  lots: TrendsLot[]
  sort: SortState
  onSort: (key: SortKey) => void
  selected: string | null
  /** Lot hovered on the chart: highlighted row. */
  hovered: string | null
  onHover: (cpalLot: string | null) => void
  onSelect: (cpalLot: string) => void
}

/** KAN-256 — lot table: two-line cells, sortable headers (indicator on the active one), row ↔ point sync. */
export function TrendsTable({ lots, sort, onSort, selected, hovered, onHover, onSelect }: TrendsTableProps) {
  return (
    <Table aria-label="Lots et risque de péremption" containerClassName="h-full overflow-auto" className="tabular-nums">
      <TableHeader className="sticky top-0 z-10 bg-background shadow-xs">
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((c) => {
            const active = sort.key === c.key
            return (
              <TableHead
                key={c.key}
                scope="col"
                aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
                className={cn('h-9 px-3 text-xs font-medium text-muted-foreground', c.numeric && 'text-right')}
              >
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => onSort(c.key)}
                  className={cn(
                    '-mx-2 font-medium text-muted-foreground hover:bg-transparent hover:text-foreground',
                    active && 'text-foreground',
                    c.numeric && 'flex-row-reverse',
                  )}
                >
                  {c.label}
                  {active && (sort.desc ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />)}
                </Button>
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lots.map((l) => {
          const placed = l.placed
          const ratio = l.velocityRatio
          const meta = RISK_META[l.risk]
          const isSelected = l.cpalLot === selected
          return (
            <TableRow
              key={l.cpalLot}
              id={trendsRowId(l.cpalLot)}
              data-testid="trends-row"
              aria-selected={isSelected}
              tabIndex={0}
              onMouseEnter={() => onHover(l.cpalLot)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(l.cpalLot)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(l.cpalLot)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(l.cpalLot)
                }
              }}
              className={cn(
                'h-11 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                l.cpalLot === hovered && 'bg-muted/50',
                isSelected && 'bg-accent shadow-[inset_3px_0_0_var(--signal)] hover:bg-accent',
              )}
            >
              <TableCell className="px-3 py-1.5">
                <TwoLines main={<span className="font-semibold text-foreground">{l.custLotNumber}</span>} sub={l.productName} />
              </TableCell>
              <TableCell className="px-3 py-1.5">
                <TwoLines main={formatExpiry(l.expiryDate)} sub={`${formatNumber(l.daysToExpiry, 0)} j`} />
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right">{formatNumber(l.balanceKg)} kg</TableCell>
              <TableCell className="px-3 py-1.5 text-right">
                <TwoLines
                  className="items-end"
                  main={`${formatNumber(l.referenceVelocity)} → ${formatNumber(l.requiredVelocity)} kg/sem.`}
                  sub={ratio !== null && <span className="font-semibold text-foreground">{formatRatio(ratio)}</span>}
                />
              </TableCell>
              <TableCell className="px-3 py-1.5 text-right">
                {placed ? formatZ(l.z) : <span className="text-xs text-muted-foreground">historique insuffisant</span>}
              </TableCell>
              <TableCell className="px-3 py-1.5">
                {placed ? (
                  <Badge variant={meta.variant}>
                    <meta.icon aria-hidden />
                    {meta.label}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
