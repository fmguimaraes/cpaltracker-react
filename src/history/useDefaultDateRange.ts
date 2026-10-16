import { useEffect, useState } from 'react'
import { ApiError } from '../api/client'
import { fetchContractHistory, parseContractDate, type HistoryResponse } from '../api/history'
import { computeLegacyDefaultRange, formatIsoDate } from './dateRange'

export type DefaultDateRangeState =
  | { status: 'loading' }
  | {
      status: 'ready'
      start: Date | null
      end: Date | null
      history: HistoryResponse
      /**
       * KAN-176 (FR5-FR8, NFR8) — re-fetches with an explicit,
       * already-validated range (`DateRangePicker`'s `onApply` payload,
       * `null` on a side meaning "unbounded", same convention
       * `fetchContractHistory` itself uses). This is the wiring
       * `DateRangePicker` (KAN-170) was built against but never had a
       * caller for until this story: calling it moves the state straight
       * back to `'loading'` then `'ready'`/`'unauthorized'`/`'error'`,
       * exactly like the initial default-range load, so every consumer
       * of this hook (`HistoryAccessGate`) needs no separate code path
       * for an explicit vs. a defaulted range.
       */
      applyRange: (range: { start: Date | null; end: Date | null }) => void
    }
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
 * The two-request dance above only runs once, for the initial no-range-
 * supplied load (FR3 is specifically about that case). KAN-176 (FR5-FR8,
 * NFR8) adds the other half: once `status === 'ready'`, the resolved
 * state carries an `applyRange` callback a caller can invoke with an
 * already-validated explicit range (`DateRangePicker`'s `onApply`
 * payload) to re-fetch directly — single request, no default-guessing —
 * and land back in this same `'ready'`/`'unauthorized'`/`'error'` state
 * machine.
 */
export function useDefaultDateRange(contractId: number): DefaultDateRangeState {
  const [state, setState] = useState<DefaultDateRangeState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    // KAN-176 — the explicit-range path `applyRange` uses. Shared with the
    // default-range `load()` below (same fetch/error handling) so an
    // explicit, user-picked range and the FR3 default are resolved through
    // the exact same success/unauthorized/error mapping.
    async function loadExplicit(range: { start: Date | null; end: Date | null }) {
      setState({ status: 'loading' })
      try {
        const response = await fetchContractHistory(contractId, range)
        if (cancelled) return
        setState({ status: 'ready', start: range.start, end: range.end, history: response, applyRange: loadExplicit })
      } catch (err) {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'unauthorized' })
          return
        }
        setState({ status: 'error' })
      }
    }

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
          setState({
            status: 'ready',
            start: resolved.start,
            end: resolved.end,
            history: firstResponse,
            applyRange: loadExplicit,
          })
          return
        }

        const correctedResponse = await fetchContractHistory(contractId, resolved)
        if (cancelled) return
        setState({
          status: 'ready',
          start: resolved.start,
          end: resolved.end,
          history: correctedResponse,
          applyRange: loadExplicit,
        })
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
