import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FleetMap } from './FleetMap'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
})

const devices = [
  { id: 'a', name: 'a', status: 'ok' as const, lat: 48.8, lng: 2.3 },
  { id: 'b', name: 'b', status: 'ok' as const, lat: 43.3, lng: 5.4 },
]

describe('FleetMap onViewportChange', () => {
  it('reports the visible bounds once mounted, as plain degrees', () => {
    const onViewportChange = vi.fn()
    render(<FleetMap devices={devices} onViewportChange={onViewportChange} />)
    expect(onViewportChange).toHaveBeenCalled()
    const viewport = onViewportChange.mock.calls.at(-1)![0]
    expect(Object.keys(viewport).sort()).toEqual(['east', 'north', 'south', 'west'])
    for (const value of Object.values(viewport)) expect(Number.isFinite(value)).toBe(true)
  })

  it('without fitKey, a new device set re-frames the map and reports the new bounds', () => {
    const onViewportChange = vi.fn()
    const { rerender } = render(<FleetMap devices={devices} onViewportChange={onViewportChange} />)
    const calls = onViewportChange.mock.calls.length
    rerender(<FleetMap devices={devices.slice(0, 1)} onViewportChange={onViewportChange} />)
    expect(onViewportChange.mock.calls.length).toBeGreaterThan(calls)
  })

  it('with fitKey, a new device set does not move the map (no new bounds sent)', () => {
    const onViewportChange = vi.fn()
    const { rerender } = render(<FleetMap devices={devices} onViewportChange={onViewportChange} fitKey="k" />)
    const calls = onViewportChange.mock.calls.length
    rerender(<FleetMap devices={devices.slice(0, 1)} onViewportChange={onViewportChange} fitKey="k" />)
    expect(onViewportChange).toHaveBeenCalledTimes(calls)
  })
})
