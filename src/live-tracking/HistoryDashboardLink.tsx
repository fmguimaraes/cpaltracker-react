import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HISTORY_DASHBOARD_PATH } from '../auth/paths'

/**
 * KAN-165 (FR14) — the "Open History Dashboard" link, carrying the
 * selected contract and an active date range (CB-10: legacy `index.php`
 * targets `dashboard.php?contrat_id=…&date_from=…&date_to=…`; this keeps
 * the same param names so the eventual KAN-139 route can read them the
 * same way). Hidden entirely before a contract is selected — this
 * component is only ever mounted once one is, by its caller.
 *
 * No date-range picker exists anywhere yet in this React app (that's
 * this story's only source of "active date range" — a full date-range
 * feature is out of scope here), so this component owns a minimal one,
 * defaulting to the last 7 days.
 */
function defaultRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const toLocalInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  return { from: toLocalInputValue(from), to: toLocalInputValue(now) }
}

export function HistoryDashboardLink({ contractId }: { contractId: number }) {
  const [range, setRange] = useState(defaultRange)

  const params = new URLSearchParams({
    contrat_id: String(contractId),
    date_from: range.from,
    date_to: range.to,
  })

  return (
    <div
      className="flex flex-wrap items-end gap-3 text-sm"
      data-testid="history-dashboard-panel"
    >
      <label className="flex flex-col gap-1" style={{ color: 'var(--color-text)' }}>
        Du
        <input
          type="datetime-local"
          value={range.from}
          onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
          data-testid="history-date-from"
        />
      </label>
      <label className="flex flex-col gap-1" style={{ color: 'var(--color-text)' }}>
        Au
        <input
          type="datetime-local"
          value={range.to}
          onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
          data-testid="history-date-to"
        />
      </label>
      <Link
        to={`${HISTORY_DASHBOARD_PATH}?${params.toString()}`}
        data-testid="history-dashboard-link"
        className="rounded-md border px-3 py-2"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      >
        Ouvrir le tableau de bord
      </Link>
    </div>
  )
}
