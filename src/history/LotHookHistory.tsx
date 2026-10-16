import type { HistoryHook } from '../api/history'
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
      <p data-testid="lot-hook-history-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucun historique d'accrochage de lot sur cette période.
      </p>
    )
  }

  return (
    <table data-testid="lot-hook-history" className="w-full text-sm" style={{ color: 'var(--color-text)' }}>
      <thead>
        <tr>
          <th className="text-left">Appareil</th>
          <th className="text-left">Lot cPAL</th>
          <th className="text-left">Lot client</th>
          <th className="text-left">Du</th>
          <th className="text-left">Au</th>
          <th className="text-left">Poids net</th>
          <th className="text-left">Poids brut</th>
          <th className="text-left">Quantité</th>
          <th className="text-left">Péremption</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${row.chipId}-${row.cpalLot}-${index}`} data-testid={`lot-hook-row-${index}`}>
            <td>{row.chipId}</td>
            <td>{row.cpalLot}</td>
            <td>{row.clientLot}</td>
            <td>{row.from}</td>
            <td>{row.to}</td>
            <td>{row.netWeight}</td>
            <td>{row.grossWeight}</td>
            <td>{row.quantity}</td>
            <td>{row.expiry}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
