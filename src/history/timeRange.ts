import { resolveRange, type TimeRangeValue } from '@/ui/patterns/time-picker'
import { formatIsoDate } from './dateRange'

/**
 * KAN-226 (FR9) — bridges the kit `TimePicker` (instants, local time) and the
 * history endpoint (whole days, `AAAA-MM-JJ`, UTC midnight `Date`s). Pure.
 */

/** UTC-midnight day of an instant, read in the viewer's local calendar. */
function localDayToUtc(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

/** Local-midnight `Date` showing the same calendar day as a UTC-midnight `Date`. */
export function utcDayToLocal(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** The day-granular `{ start, end }` the history fetch understands, for a picked `TimePicker` value. */
export function dayRangeFromTimePicker(value: TimeRangeValue, now: Date = new Date()): { start: Date; end: Date } {
  const { from, to } = resolveRange(value, now)
  return { start: localDayToUtc(from), end: localDayToUtc(to) }
}

/** The `TimePicker` value showing an applied day range (open sides: last 30 days preset). */
export function timePickerValueFromDays(start: Date | null, end: Date | null): TimeRangeValue {
  if (start === null || end === null) return { preset: '30d' }
  const to = utcDayToLocal(end)
  to.setHours(23, 59, 59, 999)
  return { preset: 'custom', from: utcDayToLocal(start), to }
}

/** `AAAA-MM-JJ` strings of a day range, for the shared validator. */
export function isoDays(range: { start: Date; end: Date }): { start: string; end: string } {
  return { start: formatIsoDate(range.start), end: formatIsoDate(range.end) }
}
