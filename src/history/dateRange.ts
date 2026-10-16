/**
 * KAN-170 (FR3, FR5-FR8, NFR4) — pure date-range validation and
 * default-range computation for the History Dashboard.
 *
 * Mirrors `cpal_history_valider_plage()`/`cpal_history_parser_date_iso()`
 * (`cpaltracker.web/history_logic.php`) exactly, so a range this module
 * accepts is guaranteed to also be accepted by `GET
 * /api/v1/contracts/history.php/{id}` (FR5: validate client-side BEFORE
 * issuing the request, never relying on the server to catch what this
 * module let through). Each rule below cites the exact backend behavior it
 * mirrors — this is deliberately NOT the legacy page's behavior (FR6-FR8
 * are explicit fixes, not replications).
 */

export const MAX_SPAN_YEARS = 1

export type DateRangeFieldError =
  | { field: 'start'; code: 'invalid_start'; message: string }
  | { field: 'end'; code: 'invalid_end'; message: string }
  | { field: 'range'; code: 'invalid_range'; message: string }
  | { field: 'range'; code: 'range_too_large'; message: string }

export type DateRangeValidationResult =
  | { ok: true; start: Date | null; end: Date | null }
  | { ok: false; error: DateRangeFieldError }

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parses a `YYYY-MM-DD` string into a UTC midnight `Date`. An empty/blank
 * input means "no bound on this side" (`null`) — same as the backend
 * treating an absent `start`/`end` as unbounded, not an error. Anything
 * non-empty that isn't a real calendar date in that exact format is
 * `'invalid'`.
 */
export function parseIsoDate(raw: string): Date | null | 'invalid' {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const match = ISO_DATE_PATTERN.exec(trimmed)
  if (!match) return 'invalid'

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  const isRealCalendarDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return isRealCalendarDate ? date : 'invalid'
}

export function formatIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function addOneYearUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + MAX_SPAN_YEARS, date.getUTCMonth(), date.getUTCDate()))
}

function subtractDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

/**
 * Validates a pair of raw date-input strings (FR5-FR8). Only when BOTH
 * sides are present does ordering (FR6) or span (FR8) get checked — a
 * single bound can't have a span, so a one-sided range is accepted
 * unbounded on the other side, exactly like the backend.
 */
export function validateDateRangeInputs(startRaw: string, endRaw: string): DateRangeValidationResult {
  const start = parseIsoDate(startRaw)
  if (start === 'invalid') {
    return {
      ok: false,
      error: { field: 'start', code: 'invalid_start', message: 'La date de début est invalide (AAAA-MM-JJ).' },
    }
  }

  const end = parseIsoDate(endRaw)
  if (end === 'invalid') {
    return {
      ok: false,
      error: { field: 'end', code: 'invalid_end', message: 'La date de fin est invalide (AAAA-MM-JJ).' },
    }
  }

  if (start !== null && end !== null) {
    if (end.getTime() < start.getTime()) {
      return {
        ok: false,
        error: {
          field: 'range',
          code: 'invalid_range',
          message: 'La date de fin ne peut pas précéder la date de début.',
        },
      }
    }
    const maxEnd = addOneYearUtc(start)
    if (end.getTime() > maxEnd.getTime()) {
      return {
        ok: false,
        error: {
          field: 'range',
          code: 'range_too_large',
          message: `La période demandée ne peut pas dépasser ${MAX_SPAN_YEARS} an.`,
        },
      }
    }
  }

  return { ok: true, start, end }
}

/**
 * FR3 (replicates CB5) — the legacy-equivalent default range applied when
 * the user supplies no date range at all: the whole contract period
 * (`DebutContrat`/`FinContrat`), capped at "now" on the upper bound, or the
 * last 30 days when the contract has no start/end dates set. Each bound
 * falls back independently (§12 edge cases): an open-ended contract (no
 * `FinContrat`) caps its upper bound at `now`; a contract with no
 * `DebutContrat` gets a lower bound 30 days before whatever the upper
 * bound resolved to.
 */
export function computeLegacyDefaultRange(
  contractStart: Date | null,
  contractEnd: Date | null,
  now: Date,
): { start: Date; end: Date } {
  const end = contractEnd !== null && contractEnd.getTime() < now.getTime() ? contractEnd : now
  const start = contractStart !== null ? contractStart : subtractDaysUtc(end, 30)
  return { start, end }
}
