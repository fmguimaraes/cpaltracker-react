import type { HistoryHook } from '../api/history'
import { formatUtcInstant } from './timelineData'

/**
 * KAN-175 (FR21) — formats the lot-hook ("accrochage de lot") history list,
 * replicating CB14 exactly: one row per hook record, from the response's
 * own `hooks` array, with no client-side filtering by device-checklist
 * selection — FR9's "filter the map, charts and summary" enumerates exactly
 * those three panels, not the lot-hook history, and FR21 itself says
 * "for the contract/devices/range from the response's hooks data" with no
 * selection qualifier. The checklist therefore does not drive this list
 * (deliberate, not an oversight — see `HistoryReadyPanel.tsx`'s comment).
 *
 * CB15: a response with no hooks (missing/unmigrated DDLOT tables) is a
 * perfectly valid empty array here — this module has no "error" case of its
 * own, matching the backend's own graceful degradation.
 */
export interface LotHookRow {
  chipId: string
  cpalLot: string
  clientLot: string
  from: string
  to: string
  netWeight: string
  grossWeight: string
  quantity: string
  expiry: string
}

const DASH = '—'

function fixedOrDash(value: number | null, digits: number, unit: string): string {
  if (value === null || Number.isNaN(value)) return DASH
  return `${value.toFixed(digits)}${unit}`
}

export function formatLotHookRows(hooks: HistoryHook[]): LotHookRow[] {
  return hooks.map((hook) => ({
    chipId: hook.c,
    cpalLot: String(hook.lot),
    clientLot: hook.cust ?? DASH,
    from: formatUtcInstant(hook.from),
    to: formatUtcInstant(hook.to),
    netWeight: fixedOrDash(hook.net, 2, ' kg'),
    grossWeight: fixedOrDash(hook.gros, 2, ' kg'),
    quantity: hook.nb === null || hook.nb === undefined ? DASH : String(hook.nb),
    expiry: hook.per ?? DASH,
  }))
}
