import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Position } from '../api/positions'
import { DeviceList } from './DeviceList'

function stubViewport(mobile = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches: mobile, addEventListener: () => undefined, removeEventListener: () => undefined }),
  })
  vi.stubGlobal('innerWidth', mobile ? 390 : 1440)
}

beforeEach(() => stubViewport())


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
  afterEach(() => vi.unstubAllGlobals())

  it('at 390 px renders one card list with the same testids on the visible elements (KAN-227, NFR3)', () => {
    stubViewport(true)
    render(<DeviceList devices={[device]} onSelect={() => undefined} />)

    expect(screen.getByTestId('pilotage-device-list').tagName).toBe('UL')
    expect(screen.getByTestId('pilotage-device-CHIP-001').tagName).toBe('LI')
    expect(screen.getByTestId('pilotage-device-CHIP-001-select')).toBeInTheDocument()
    expect(screen.getByTestId('pilotage-device-CHIP-001-last-seen')).toBeInTheDocument()
  })

  it('at 390 px shows every card up to 50 devices with the count and no "Afficher plus" (KAN-217)', () => {
    stubViewport(true)
    const devices = Array.from({ length: 25 }, (_, i) => ({ ...device, chipId: `CHIP-${i}` }))
    render(<DeviceList devices={devices} onSelect={() => undefined} />)

    expect(screen.getByTestId('pilotage-device-list').querySelectorAll(':scope > li')).toHaveLength(25)
    expect(screen.getByText('25 sur 25')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull()
  })

  it('at 390 px windows a large device set: few cards mounted, the count shows the total (KAN-217)', () => {
    stubViewport(true)
    const devices = Array.from({ length: 5000 }, (_, i) => ({ ...device, chipId: `CHIP-${i}` }))
    render(<DeviceList devices={devices} selectedChipId="CHIP-0" onSelect={() => undefined} />)

    const list = screen.getByTestId('pilotage-device-list')
    expect(list).toHaveAttribute('data-windowed', 'true')
    const mounted = list.querySelectorAll(':scope > li').length
    expect(mounted).toBeGreaterThan(0)
    expect(mounted).toBeLessThan(100)
    expect(screen.getByText('5000 sur 5000')).toBeInTheDocument()
    expect(screen.getByTestId('pilotage-device-CHIP-0-select')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).toBeNull()
  })

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

  it('renders plain, non-interactive rows when no onSelect is supplied (KAN-163, unchanged default)', () => {
    render(<DeviceList devices={[device]} />)

    expect(screen.queryByTestId('pilotage-device-CHIP-001-select')).not.toBeInTheDocument()
  })

  it('calls onSelect with the chip id when a device row is clicked (KAN-163, FR7)', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <DeviceList
        devices={[device, { ...device, chipId: 'CHIP-002' }]}
        selectedChipId="CHIP-001"
        onSelect={onSelect}
      />,
    )

    expect(screen.getByTestId('pilotage-device-CHIP-001-select')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('pilotage-device-CHIP-002-select')).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByTestId('pilotage-device-CHIP-002-select'))

    expect(onSelect).toHaveBeenCalledWith('CHIP-002')
  })

  it('virtualizes a large device set without crashing, rather than rendering every row (KAN-173, NFR5)', () => {
    const devices = Array.from({ length: 80 }, (_, i) => ({ ...device, chipId: `CHIP-${i}` }))
    render(<DeviceList devices={devices} />)

    expect(screen.getByTestId('pilotage-device-list-scroll')).toBeInTheDocument()
  })
})
