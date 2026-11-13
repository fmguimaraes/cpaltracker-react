import { describe, expect, it } from 'vitest'
import { parseContractDate } from './history'

describe('parseContractDate', () => {
  it('returns null for a null value', () => {
    expect(parseContractDate(null)).toBeNull()
  })

  it('parses a bare YYYY-MM-DD date as UTC midnight', () => {
    expect(parseContractDate('2026-01-01')?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('parses a DATETIME value as sent by the backend, ignoring the time part', () => {
    expect(parseContractDate('2026-01-01 00:00:00')?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(parseContractDate('2027-03-15 18:45:12')?.toISOString()).toBe('2027-03-15T00:00:00.000Z')
  })
})
