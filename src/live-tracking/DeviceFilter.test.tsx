import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DeviceFilter } from './DeviceFilter'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'

describe('DeviceFilter (KAN-162 FR8)', () => {
  afterEach(() => {
    useDeviceVisibilityStore.getState().showAll()
  })

  it('renders nothing when there are no devices', () => {
    render(<DeviceFilter chipIds={[]} />)
    expect(screen.queryByTestId('device-filter')).not.toBeInTheDocument()
  })

  it('renders one checked checkbox per chipId by default', () => {
    render(<DeviceFilter chipIds={['CHIP-001', 'CHIP-002']} />)
    expect(screen.getByTestId('device-filter-CHIP-001')).toBeChecked()
    expect(screen.getByTestId('device-filter-CHIP-002')).toBeChecked()
  })

  it('unchecking a device hides it via the store', () => {
    render(<DeviceFilter chipIds={['CHIP-001']} />)
    fireEvent.click(screen.getByTestId('device-filter-CHIP-001'))
    expect(screen.getByTestId('device-filter-CHIP-001')).not.toBeChecked()
    expect(useDeviceVisibilityStore.getState().isVisible('CHIP-001')).toBe(false)
  })

  it('"show all" re-checks every device', () => {
    render(<DeviceFilter chipIds={['CHIP-001', 'CHIP-002']} />)
    fireEvent.click(screen.getByTestId('device-filter-CHIP-001'))
    fireEvent.click(screen.getByTestId('device-filter-show-all'))
    expect(screen.getByTestId('device-filter-CHIP-001')).toBeChecked()
    expect(screen.getByTestId('device-filter-CHIP-002')).toBeChecked()
  })
})
