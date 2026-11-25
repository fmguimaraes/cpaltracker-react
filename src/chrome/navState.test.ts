import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NAV_STATE_KEY, isMapPage, navOpenFor, readNavChoice } from './navState'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('shell nav state (unified shell §1.1)', () => {
  it('map pages default to the rail, every other page to the expanded nav', () => {
    expect(isMapPage('/pulse')).toBe(true)
    expect(isMapPage('/live-tracking')).toBe(true)
    expect(navOpenFor('/pulse', null)).toBe(false)
    expect(navOpenFor('/pilotage', null)).toBe(true)
    expect(navOpenFor('/trends', null)).toBe(true)
  })

  it('the stored choice overrides the page default', () => {
    expect(navOpenFor('/pulse', 'expanded')).toBe(true)
    expect(navOpenFor('/pilotage', 'rail')).toBe(false)
  })

  it('reads a stored choice and ignores anything else', () => {
    expect(readNavChoice()).toBeNull()
    window.localStorage.setItem(NAV_STATE_KEY, 'rail')
    expect(readNavChoice()).toBe('rail')
    window.localStorage.setItem(NAV_STATE_KEY, 'bogus')
    expect(readNavChoice()).toBeNull()
  })

  it('an unavailable localStorage reads as "no choice"', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readNavChoice()).toBeNull()
  })
})
