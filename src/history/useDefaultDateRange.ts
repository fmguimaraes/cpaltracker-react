import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { fetchContractHistory, parseContractDate, type HistoryResponse } from '../api/history'
import { computeLegacyDefaultRange, formatIsoDate } from './dateRange'

export type DefaultDateRangeState =
  | { status: 'loading' }
  | { status: 'ready'; start: Date; end: Date; history: HistoryResponse }
  | { status: 'unauthorized' }
  | { status: 'error' }

/**
 * KAN-170 (FR3) — resolves the legacy-equivalent default date range on
 * load, when the user hasn't picked one yet.
 *
 * FR3's default (`computeLegacyDefaultRange`) needs the contract's
 * `DebutContrat`/`FinContrat` — but the only place those are ever exposed
 * is this same history endpoint's own `contract` field (`contracts/list.php`
 * never carries them, confirmed by reading its SELECT — KAN-139
 * investigation). Requesting a fresh, narrower backend endpoint just for
 * that metadata would need its own separately-authorized exception (the
 * KAN-158/KAN-165 pattern), and calling this endpoint with no `start`/`end`
 * at all would pull the contract's ENTIRE unbounded history as the literal
 * first request — exactly the cost FR3's default exists to avoid. Neither
 * is acceptable, so this hook resolves the default with two requests
 * instead of a backend change:
 *
 *   1. Fetch a bounded provisional guess (last 30 days, i.e. what FR3
 *      itself falls back to for a contract with no dates set at all) —
 *      this is never unbounded, so it's always cheap.
 *   2. Read `contract.DebutContrat`/`FinContrat` off that response and
 *      compute the REAL default via `computeLegacyDefaultRange`. If it
 *      matches the guess (the common case: an open-ended contract with no
 *      explicit dates), the first fetch's rows are already correct and are
 *      used as-is — no second request. If the contract has explicit dates
 *      that resolve to a different range, a second, corrected fetch
 *      replaces it.
 *
 * This only runs when the caller hasn't supplied an explicit range yet
 * (FR3 is specifically about the no-range-supplied case) — a caller with
 * an explicit user-picked range should call `fetchContractHistory`
 * directly instead of through this hook.
 */
export function useDefaultDateRange(contractId: number): DefaultDateRangeState {
  const [state, setState] = useState<DefaultDateRangeState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    async function load() {
      const now = new Date()
      const guess = computeLegacyDefaultRange(null, null, now)

      try {
        const firstResponse = await fetchContractHistory(contractId, guess)
        if (cancelled) return

        const contractStart = parseContractDate(firstResponse.contract.DebutContrat)
        const contractEnd = parseContractDate(firstResponse.contract.FinContrat)
        const resolved = computeLegacyDefaultRange(contractStart, contractEnd, now)

        const guessMatchesResolved =
          formatIsoDate(guess.start) === formatIsoDate(resolved.start) &&
          formatIsoDate(guess.end) === formatIsoDate(resolved.end)

        if (guessMatchesResolved) {
          setState({ status: 'ready', start: resolved.start, end: resolved.end, history: firstResponse })
          return
        }

        const correctedResponse = await fetchContractHistory(contractId, resolved)
        if (cancelled) return
        setState({ status: 'ready', start: resolved.start, end: resolved.end, history: correctedResponse })
      } catch (err) {
        if (cancelled) return
        // Mirrors ContractPositions's KAN-168 handling: a 404 here means
        // this contract is unauthorized-or-nonexistent for the caller
        // (`cpal_contrat_autorise()`'s uniform anti-enumeration 404, FR25) —
        // kept as a distinct status so a caller can show the merged
        // "not found/not yours" message instead of a generic error.
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'unauthorized' })
          return
        }
        setState({ status: 'error' })
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [contractId])

  return state
}
