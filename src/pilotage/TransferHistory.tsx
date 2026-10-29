import type { TransferResult } from '../api/transfer'
import { Badge } from '@/ui/badge'
import { Card, CardContent } from '@/ui/card'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { ActivityTimeline, type ActivityItem } from '@/ui/timeline'
import { formatUtc } from '../history/timelineData'

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
 * KAN-227 (FR10): rendered as the kit `ActivityTimeline` (DAT-TIMELINE,
 * vertical), one item per transfer (`testId` = `transfer-history-row-*`), the
 * period as the API returned it in the item detail, its start as the item
 * time (UTC, as the monolith's "(UTC)" fields), and a `Badge` for an ongoing
 * transfer (`-ongoing`).
 *
 * CB29's "en cours" marking is preserved exactly: `openEnded` (the API's
 * own flag, derived server-side from the `HIST_SENTINELLE` check — never
 * recomputed here) renders as "en cours", otherwise the real `endDate` is
 * shown.
 */
/**
 * The API returns the transfer bounds as UTC wall-clock text (`AAAA-MM-JJ HH:MM:SS`, or a bare
 * `AAAA-MM-JJ`); turned into an ISO instant for the timeline's `<time dateTime>`.
 */
function utcTextToIso(text: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text.replace(' ', 'T')
  return /(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`
}

/** Item time: the transfer start, in UTC, to the minute. */
function formatStart(at: Date): string {
  return Number.isNaN(at.getTime()) ? '' : `${formatUtc(at.getTime()).slice(0, 16)} UTC`
}

export function TransferHistory({ entries }: { entries: TransferResult[] }) {
  if (entries.length === 0) {
    return (
      <Empty data-testid="transfer-history-empty">
        <EmptyHeader>
          <EmptyDescription>Aucun transfert enregistré pour l'instant dans cette session.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const items: ActivityItem[] = entries.map((entry, index) => {
    const rowId = `transfer-history-row-${entry.deviceId}-${index}`
    return {
      id: `${entry.deviceId}-${entry.startDate}-${index}`,
      testId: rowId,
      at: utcTextToIso(entry.startDate),
      title: `${entry.deviceId} → contrat #${entry.targetContractId}`,
      detail: entry.openEnded ? `${entry.startDate} –` : `${entry.startDate} – ${entry.endDate}`,
      badge: entry.openEnded ? (
        <Badge variant="neutral" data-testid={`${rowId}-ongoing`}>
          en cours
        </Badge>
      ) : undefined,
    }
  })

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Historique des transferts enregistrés durant cette session — l'historique complet et
          persistant n'est pas encore exposé par l'API.
        </p>
        <div data-testid="transfer-history-list">
          <ActivityTimeline items={items} formatTime={formatStart} label="Historique des transferts" />
        </div>
      </CardContent>
    </Card>
  )
}
