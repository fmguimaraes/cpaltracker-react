import { describe, expect, it } from 'vitest'
import {
  isDeviceSelected,
  selectAllDevices,
  selectNoDevices,
  toggleDeviceSelection,
} from './deviceSelection'

describe('deviceSelection (KAN-175 FR9)', () => {
  it('treats null as "every device selected"', () => {
    expect(isDeviceSelected(null, 'CHIP-A')).toBe(true)
    expect(isDeviceSelected(null, 'ANYTHING')).toBe(true)
  })

  it('treats an explicit array as the exact selected set', () => {
    expect(isDeviceSelected(['CHIP-A'], 'CHIP-A')).toBe(true)
    expect(isDeviceSelected(['CHIP-A'], 'CHIP-B')).toBe(false)
    expect(isDeviceSelected([], 'CHIP-A')).toBe(false)
  })

  it('unchecking one device from "all" (null) leaves every other device selected', () => {
    const next = toggleDeviceSelection(null, ['CHIP-A', 'CHIP-B', 'CHIP-C'], 'CHIP-B')
    expect(next).toEqual(['CHIP-A', 'CHIP-C'])
  })

  it('unchecking then rechecking the same device collapses back to null ("all")', () => {
    const allChipIds = ['CHIP-A', 'CHIP-B']
    const afterUncheck = toggleDeviceSelection(null, allChipIds, 'CHIP-A')
    const afterRecheck = toggleDeviceSelection(afterUncheck, allChipIds, 'CHIP-A')
    expect(afterRecheck).toBeNull()
  })

  it('checking a device back on from an explicit subset re-adds it, collapsing to null once that is every device', () => {
    const next = toggleDeviceSelection(['CHIP-A'], ['CHIP-A', 'CHIP-B'], 'CHIP-B')
    expect(next).toBeNull()
  })

  it('checking a device back on when another device is still unselected keeps an explicit array', () => {
    const next = toggleDeviceSelection(['CHIP-A'], ['CHIP-A', 'CHIP-B', 'CHIP-C'], 'CHIP-B')
    expect(next).toEqual(['CHIP-A', 'CHIP-B'])
  })

  it('unchecking the last remaining device yields an explicit empty array, not null', () => {
    const next = toggleDeviceSelection(['CHIP-A'], ['CHIP-A', 'CHIP-B'], 'CHIP-A')
    expect(next).toEqual([])
  })

  it('selectAllDevices resolves to null and selectNoDevices to an explicit empty array', () => {
    expect(selectAllDevices()).toBeNull()
    expect(selectNoDevices()).toEqual([])
  })
})
