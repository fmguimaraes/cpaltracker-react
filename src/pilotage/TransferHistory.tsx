import type { TransferResult } from '../api/transfer'

/**
 * KAN-169 (FR18, CB29) — the transfer history panel.
 *
 * **Known/documented gap, not fabricated data.** There is no `/api/v1`
 * endpoint that reads `T_DEVICE_HIST` (confirmed by reading every file
 * under `cpaltracker.web/api/v1` — `POST /devices/{deviceId}/transfer`
 * is the only endpoint that touches that table, and it only ever writes).
 * This panel therefore cannot load the contract's full, persisted transfer
 * history the way `pilotage.php` does today (CB29) — it renders exactly
 * the real `201` responses `TransferForm` has received *this session*
 * (`PilotageWorkspace` collects them), nothing invented or guessed. Marked
 * clearly as a session log, and logged in this story's handoff report as a
 * genuine backend open question (a `GET
 * /contracts/{contractId}/transfer-history`-shaped endpoint would resolve
 * it) rather than worked around with fabricated rows.
 *
 * CB29's "en cours" marking is preserved exactly: `openEnded` (the API's
 * own flag, derived server-side from the `HIST_SENTINELLE` check — never
 * recomputed here) renders as "en cours", otherwise the real `endDate` is
 * shown.
 */
export function TransferHistory({ entries }: { entries: TransferResult[] }) {
  if (entries.length === 0) {
    return (
      <p data-testid="transfer-history-empty" style={{ color: 'var(--color-text-muted)' }}>
        Aucun transfert enregistré pour l'instant dans cette session.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p style={{ color: 'var(--color-text-muted)' }}>
        Historique des transferts enregistrés durant cette session — l'historique complet et
        persistant n'est pas encore exposé par l'API.
      </p>
      <ul data-testid="transfer-history-list" className="flex flex-col gap-2">
        {entries.map((entry, index) => (
          <li
            key={`${entry.deviceId}-${entry.startDate}-${index}`}
            data-testid={`transfer-history-row-${entry.deviceId}-${index}`}
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            <span style={{ color: 'var(--color-text)' }}>{entry.deviceId}</span>
            {' → '}
            <span style={{ color: 'var(--color-text)' }}>contrat #{entry.targetContractId}</span>
            {' · '}
            <span style={{ color: 'var(--color-text-muted)' }}>{entry.startDate} – </span>
            {entry.openEnded ? (
              <span
                data-testid={`transfer-history-row-${entry.deviceId}-${index}-ongoing`}
                style={{ color: 'var(--color-text-muted)' }}
              >
                en cours
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>{entry.endDate}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
