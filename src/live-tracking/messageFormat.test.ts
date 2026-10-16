import { describe, expect, it } from 'vitest'
import { formatMessageDate } from './messageFormat'

describe('formatMessageDate (KAN-165 FR11/FR12)', () => {
  it('formats an ISO date as dd/mm/YYYY HH:mm', () => {
    expect(formatMessageDate('2026-10-10T08:05:00+00:00')).toBe('10/10/2026 08:05')
  })

  it('returns an empty string for null', () => {
    expect(formatMessageDate(null)).toBe('')
  })

  it('returns an empty string for an unparseable value', () => {
    expect(formatMessageDate('not-a-date')).toBe('')
  })
})
