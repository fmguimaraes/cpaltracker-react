import { describe, expect, it } from 'vitest'
import {
  computeLegacyDefaultRange,
  formatIsoDate,
  parseIsoDate,
  validateDateRangeInputs,
} from './dateRange'

describe('parseIsoDate', () => {
  it('treats an empty/blank string as "no bound" (null), not an error', () => {
    expect(parseIsoDate('')).toBeNull()
    expect(parseIsoDate('   ')).toBeNull()
  })

  it('parses a valid YYYY-MM-DD date', () => {
    const date = parseIsoDate('2026-03-05')
    expect(date).not.toBe('invalid')
    expect(formatIsoDate(date as Date)).toBe('2026-03-05')
  })

  it('rejects a non-ISO format (FR7)', () => {
    expect(parseIsoDate('05/03/2026')).toBe('invalid')
    expect(parseIsoDate('2026-3-5')).toBe('invalid')
    expect(parseIsoDate('not-a-date')).toBe('invalid')
  })

  it('rejects a syntactically-shaped but non-existent calendar date (FR7)', () => {
    expect(parseIsoDate('2026-02-30')).toBe('invalid')
    expect(parseIsoDate('2026-13-01')).toBe('invalid')
  })

  it('accepts Feb 29 only on a real leap year', () => {
    expect(parseIsoDate('2024-02-29')).not.toBe('invalid')
    expect(parseIsoDate('2026-02-29')).toBe('invalid')
  })
})

describe('validateDateRangeInputs (FR5-FR8)', () => {
  it('accepts an empty range as both bounds unbounded, with no request-blocking error', () => {
    const result = validateDateRangeInputs('', '')
    expect(result).toEqual({ ok: true, start: null, end: null })
  })

  it('accepts a one-sided range, the other side left unbounded (mirrors the backend: a single bound has no span to check)', () => {
    const startOnly = validateDateRangeInputs('2026-01-01', '')
    expect(startOnly.ok).toBe(true)
    if (startOnly.ok) {
      expect(startOnly.start).not.toBeNull()
      expect(startOnly.end).toBeNull()
    }

    const endOnly = validateDateRangeInputs('', '2026-01-01')
    expect(endOnly.ok).toBe(true)
    if (endOnly.ok) {
      expect(endOnly.start).toBeNull()
      expect(endOnly.end).not.toBeNull()
    }
  })

  it('rejects a malformed start, naming the field (FR7) — no bound is silently dropped', () => {
    const result = validateDateRangeInputs('not-a-date', '2026-01-01')
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ field: 'start', code: 'invalid_start' }),
    })
  })

  it('rejects a malformed end, naming the field (FR7)', () => {
    const result = validateDateRangeInputs('2026-01-01', 'not-a-date')
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ field: 'end', code: 'invalid_end' }),
    })
  })

  it('rejects a reversed range with no silent swap (FR6)', () => {
    const result = validateDateRangeInputs('2026-06-01', '2026-01-01')
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ field: 'range', code: 'invalid_range' }),
    })
  })

  it('accepts a range spanning exactly one year (inclusive, mirrors the backend)', () => {
    const result = validateDateRangeInputs('2025-01-01', '2026-01-01')
    expect(result.ok).toBe(true)
  })

  it('rejects a range spanning over one year, stating the limit (FR8)', () => {
    const result = validateDateRangeInputs('2025-01-01', '2026-01-02')
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ field: 'range', code: 'range_too_large' }),
    })
  })
})

describe('computeLegacyDefaultRange (FR3)', () => {
  const now = new Date(Date.UTC(2026, 5, 15))

  it('uses the whole contract period when both bounds are set, FinContrat is in the past, and the span is within 1 year', () => {
    const contractStart = new Date(Date.UTC(2025, 10, 1))
    const contractEnd = new Date(Date.UTC(2026, 2, 1))

    expect(computeLegacyDefaultRange(contractStart, contractEnd, now)).toEqual({
      start: contractStart,
      end: contractEnd,
    })
  })

  it('caps the upper bound at "now" for an open-ended contract (FinContrat null or in the future)', () => {
    const contractStart = new Date(Date.UTC(2026, 1, 1))

    expect(computeLegacyDefaultRange(contractStart, null, now)).toEqual({
      start: contractStart,
      end: now,
    })

    const futureEnd = new Date(Date.UTC(2027, 0, 1))
    expect(computeLegacyDefaultRange(contractStart, futureEnd, now)).toEqual({
      start: contractStart,
      end: now,
    })
  })

  it('clamps the start to 1 year before the resolved end when the whole contract period is over a year (review gate round 1: FR8\'s endpoint-wide cap applies to the default too)', () => {
    const contractStart = new Date(Date.UTC(2020, 0, 1))
    const contractEnd = new Date(Date.UTC(2026, 2, 1))

    expect(computeLegacyDefaultRange(contractStart, contractEnd, now)).toEqual({
      start: new Date(Date.UTC(2025, 2, 1)),
      end: contractEnd,
    })
  })

  it('clamps an open-ended, long-running contract\'s start to 1 year before "now"', () => {
    const contractStart = new Date(Date.UTC(2020, 0, 1))

    expect(computeLegacyDefaultRange(contractStart, null, now)).toEqual({
      start: new Date(Date.UTC(2025, 5, 15)),
      end: now,
    })
  })

  it('clamps a future/malformed DebutContrat (after the resolved end) to the end itself, never a reversed range', () => {
    const contractStart = new Date(Date.UTC(2027, 0, 1))

    expect(computeLegacyDefaultRange(contractStart, null, now)).toEqual({
      start: now,
      end: now,
    })
  })

  it('clamps when FinContrat precedes DebutContrat (malformed contract data) to a zero-span range, never reversed', () => {
    const contractStart = new Date(Date.UTC(2026, 0, 1))
    const contractEnd = new Date(Date.UTC(2025, 0, 1))

    const result = computeLegacyDefaultRange(contractStart, contractEnd, now)
    expect(result.start.getTime()).toBeLessThanOrEqual(result.end.getTime())
    expect(result.end).toEqual(contractEnd)
  })

  it('falls back to 30 days before the resolved upper bound when there is no DebutContrat', () => {
    const result = computeLegacyDefaultRange(null, null, now)
    expect(result.end).toEqual(now)
    expect(result.start).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
  })

  it('falls back to last-30-days when the contract has neither start nor end set', () => {
    const result = computeLegacyDefaultRange(null, null, now)
    expect(result.start.getTime()).toBeLessThan(result.end.getTime())
    expect(result.end).toEqual(now)
  })
})
