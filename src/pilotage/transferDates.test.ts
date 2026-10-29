import { describe, expect, it } from 'vitest'
import { toTransferDateTime } from './transferDates'

describe('toTransferDateTime (KAN-227, monolith datetime-local shape)', () => {
  it('serialises the picked wall-clock date and time as AAAA-MM-JJTHH:MM', () => {
    expect(toTransferDateTime(new Date(2026, 5, 10, 0, 0))).toBe('2026-06-10T00:00')
    expect(toTransferDateTime(new Date(2026, 11, 31, 23, 59, 42))).toBe('2026-12-31T23:59')
  })

  it('matches the only shape the API accepts (cpal_pilotage_date_sql)', () => {
    expect(toTransferDateTime(new Date(2026, 0, 2, 7, 5))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })
})
