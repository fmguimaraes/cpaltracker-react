import { Badge } from '@/ui/badge'
import { DataTable, type DataTableColumn } from '@/ui/data-table'
import type { TrendsLot } from '../api/trends'
import { RISK_META, RISK_ORDER, daysToExpiry, formatExpiry, formatNumber } from './trendsData'

export const trendsRowId = (cpalLot: string) => `trends-row-${cpalLot}`

const COLUMNS: DataTableColumn<TrendsLot>[] = [
  { id: 'lot', header: 'Lot client', accessorFn: (l) => l.custLotNumber, meta: { mono: true } },
  { id: 'product', header: 'Produit', accessorFn: (l) => l.productName ?? '—' },
  { id: 'balance', header: 'Solde (kg)', accessorFn: (l) => l.balanceKg, cell: (c) => formatNumber(c.getValue<number>()), meta: { numeric: true } },
  { id: 'ref', header: 'Vitesse de référence (kg/sem.)', accessorFn: (l) => l.referenceVelocity, cell: (c) => formatNumber(c.getValue<number>()), meta: { numeric: true } },
  { id: 'req', header: 'Vitesse requise (kg/sem.)', accessorFn: (l) => l.requiredVelocity, cell: (c) => formatNumber(c.getValue<number>()), meta: { numeric: true } },
  {
    id: 'risk',
    header: 'Risque',
    accessorFn: (l) => RISK_ORDER.indexOf(l.risk),
    cell: (c) => {
      const meta = RISK_META[c.row.original.risk]
      return (
        <Badge variant={meta.variant}>
          <meta.icon aria-hidden />
          {meta.label}
        </Badge>
      )
    },
  },
  { id: 'expiry', header: 'Péremption', accessorFn: (l) => l.expiryDate, cell: (c) => formatExpiry(c.getValue<string>()) },
  { id: 'days', header: 'Durée de vie restante (j)', accessorFn: (l) => daysToExpiry(l.expiryDate), meta: { numeric: true } },
]

/** KAN-256 — the lots (already sorted by risk then days to expiry by the API); the selected row is highlighted. */
export function TrendsTable({ lots, selected }: { lots: TrendsLot[]; selected: string | null }) {
  return (
    <DataTable
      label="Lots et risque de péremption"
      columns={COLUMNS}
      data={lots}
      getRowId={(l) => l.cpalLot}
      pageSize={100}
      stickyHeader
      emptyMessage="Aucun lot."
      labels={{ range: (f, t, n) => `${f}–${t} sur ${n}`, page: (p, n) => `Page ${p} sur ${n}`, previousPage: 'Page précédente', nextPage: 'Page suivante' }}
      rowProps={(l) => ({
        id: trendsRowId(l.cpalLot),
        'aria-selected': l.cpalLot === selected,
        'data-testid': 'trends-row',
        className: l.cpalLot === selected ? 'bg-muted' : undefined,
      })}
    />
  )
}
