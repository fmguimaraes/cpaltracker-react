import { describe, expect, it } from 'vitest'
import { dayRangeFromTimePicker, timePickerValueFromDays, utcDayToLocal } from './timeRange'

describe('timeRange (KAN-226 FR9)', () => {
  it('maps a rolling preset onto whole UTC days ending on the local day of "now"', () => {
    const now = new Date(2026, 9, 28, 15, 30)
    const { start, end } = dayRangeFromTimePicker({ preset: '7d' }, now)
    expect(start.toISOString()).toBe('2026-10-21T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-28T00:00:00.000Z')
  })

  it('maps a custom calendar range onto the days it covers', () => {
    const from = new Date(2026, 0, 5, 0, 0, 0, 0)
    const to = new Date(2026, 0, 9, 23, 59, 59, 999)
    const { start, end } = dayRangeFromTimePicker({ preset: 'custom', from, to })
    expect(start.toISOString()).toBe('2026-01-05T00:00:00.000Z')
    expect(end.toISOString()).toBe('2026-01-09T00:00:00.000Z')
  })

  it('shows an applied day range as a custom value covering both days, and an open range as 30 d', () => {
    const value = timePickerValueFromDays(new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 0, 9)))
    expect(value.preset).toBe('custom')
    if (value.preset === 'custom') {
      expect(value.from).toEqual(new Date(2026, 0, 5))
      expect(value.to.getDate()).toBe(9)
    }
    expect(timePickerValueFromDays(null, null)).toEqual({ preset: '30d' })
  })

  it('reads a UTC day as the same calendar day in local time', () => {
    expect(utcDayToLocal(new Date(Date.UTC(2026, 2, 1)))).toEqual(new Date(2026, 2, 1))
  })
})
