import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Position } from '../api/positions'
import { DeviceList } from './DeviceList'

const device: Position = {
  contractId: 12,
  chipId: 'CHIP-001',
  timestamp: '2026-10-10T08:00:05Z',
  latitude: 48.8566,
  longitude: 2.3522,
  ambientTemperature: 19.1,
  humidity: 55,
  mass: 420,
  mpuTemperature: 21.5,
  accelG: 1.02,
}

describe('DeviceList (KAN-159 FR5, FR6)', () => {
  it('shows an explicit empty state for a contract with zero devices', () => {
    render(<DeviceList devices={[]} />)

    expect(screen.getByTestId('pilotage-devices-empty')).toBeInTheDocument()
  })

  it('renders one row per device, identified by chip id', () => {
    render(<DeviceList devices={[device, { ...device, chipId: 'CHIP-002', timestamp: null }]} />)

    expect(screen.getByTestId('pilotage-device-CHIP-001')).toHaveTextContent('CHIP-001')
    expect(screen.getByTestId('pilotage-device-CHIP-002')).toHaveTextContent('CHIP-002')
  })

  it('shows the last-known position timestamp when present, labeled as a position (not a calibration date)', () => {
    render(<DeviceList devices={[device]} />)

    const lastSeen = screen.getByTestId('pilotage-device-CHIP-001-last-seen')
    expect(lastSeen).toHaveTextContent('Dernière position connue : 2026-10-10T08:00:05Z')
    expect(lastSeen.textContent).not.toMatch(/calibration/i)
  })

  it('omits the last-known position line for a device with no timestamp, rather than showing a blank', () => {
    render(<DeviceList devices={[{ ...device, timestamp: null }]} />)

    expect(screen.queryByTestId('pilotage-device-CHIP-001-last-seen')).not.toBeInTheDocument()
  })
})
