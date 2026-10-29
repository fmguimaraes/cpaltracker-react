import type { HistoryHook } from '../api/history'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'
import { formatLotHookRows } from './lotHooks'

/**
 * KAN-175 (FR21) — the lot-hook ("accrochage de lot") history table,
 * replicating CB14/CB15: rendered straight from the response's `hooks`
 * array, degrading to an empty-state message (not an error) when there are
 * none — whether because nothing was hooked in range or because the
 * backend's own DDLOT tables aren't migrated on this environment (CB15).
 * Not filtered by the device checklist — see `lotHooks.ts`'s doc comment
 * for why.
 */
export function LotHookHistory({ hooks }: { hooks: HistoryHook[] }) {
  const rows = formatLotHookRows(hooks)

  if (rows.length === 0) {
    return (
      <p data-testid="lot-hook-history-empty" className="text-sm text-muted-foreground">
        Aucun historique d'accrochage de lot sur cette période.
      </p>
    )
  }

  return (
    <Table data-testid="lot-hook-history" className="tabular-nums" containerClassName="overflow-x-auto">
      <TableHeader>
        <TableRow>
          <TableHead>Appareil</TableHead>
          <TableHead>Lot cPAL</TableHead>
          <TableHead>Lot client</TableHead>
          <TableHead>Du</TableHead>
          <TableHead>Au</TableHead>
          <TableHead className="text-right">Poids net</TableHead>
          <TableHead className="text-right">Poids brut</TableHead>
          <TableHead className="text-right">Quantité</TableHead>
          <TableHead>Péremption</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.chipId}-${row.cpalLot}-${index}`} data-testid={`lot-hook-row-${index}`}>
            <TableCell className="font-mono">{row.chipId}</TableCell>
            <TableCell>{row.cpalLot}</TableCell>
            <TableCell>{row.clientLot}</TableCell>
            <TableCell>{row.from}</TableCell>
            <TableCell>{row.to}</TableCell>
            <TableCell className="text-right">{row.netWeight}</TableCell>
            <TableCell className="text-right">{row.grossWeight}</TableCell>
            <TableCell className="text-right">{row.quantity}</TableCell>
            <TableCell>{row.expiry}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
