import { afterEach, describe, expect, it } from 'vitest'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'

describe('deviceVisibilityStore (KAN-162 FR8)', () => {
  afterEach(() => {
    useDeviceVisibilityStore.getState().showAll()
  })

  it('treats every chipId as visible by default', () => {
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-001')).toBe(true)
  })

  it('toggling a visible device hides it', () => {
    useDeviceVisibilityStore.getState().toggleDevice('CHIP-001')
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-001')).toBe(false)
  })

  it('toggling a hidden device shows it again', () => {
    useDeviceVisibilityStore.getState().toggleDevice('CHIP-001')
    useDeviceVisibilityStore.getState().toggleDevice('CHIP-001')
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-001')).toBe(true)
  })

  it('toggling one device does not affect another', () => {
    useDeviceVisibilityStore.getState().toggleDevice('CHIP-001')
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-002')).toBe(true)
  })

  it('showAll clears every hidden device', () => {
    useDeviceVisibilityStore.getState().toggleDevice('CHIP-001')
    useDeviceVisibilityStore.getState().toggleDevice('CHIP-002')
    useDeviceVisibilityStore.getState().showAll()
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-001')).toBe(true)
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-002')).toBe(true)
  })
})
