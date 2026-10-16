import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HistoryDevice } from '../api/history'
import { DeviceChecklist } from './DeviceChecklist'

function device(chipId: string): HistoryDevice {
  return { ChipID: chipId, STATUT: 'actif', MORT: 0 }
}

describe('DeviceChecklist (KAN-175 FR9, NFR3)', () => {
  it('renders an empty-state message when there are no devices', () => {
    render(<DeviceChecklist devices={[]} selected={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('device-checklist-empty')).toBeInTheDocument()
  })

  it('renders every device checked by default (selected === null)', () => {
    render(<DeviceChecklist devices={[device('A'), device('B')]} selected={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('device-checklist-item-A')).toBeChecked()
    expect(screen.getByTestId('device-checklist-item-B')).toBeChecked()
  })

  it('reflects an explicit selection', () => {
    render(<DeviceChecklist devices={[device('A'), device('B')]} selected={['A']} onChange={vi.fn()} />)
    expect(screen.getByTestId('device-checklist-item-A')).toBeChecked()
    expect(screen.getByTestId('device-checklist-item-B')).not.toBeChecked()
  })

  it('calls onChange with the toggled selection, with no network call', () => {
    const onChange = vi.fn()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<DeviceChecklist devices={[device('A'), device('B')]} selected={null} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('device-checklist-item-A'))

    expect(onChange).toHaveBeenCalledWith(['B'])
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('"Tout sélectionner" / "Tout désélectionner" call onChange with null / []', () => {
    const onChange = vi.fn()
    render(<DeviceChecklist devices={[device('A')]} selected={['A']} onChange={onChange} />)

    fireEvent.click(screen.getByTestId('device-checklist-select-none'))
    expect(onChange).toHaveBeenLastCalledWith([])

    fireEvent.click(screen.getByTestId('device-checklist-select-all'))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('virtualizes long device lists without crashing (NFR3)', () => {
    const devices = Array.from({ length: 80 }, (_, i) => device(`CHIP-${i}`))
    render(<DeviceChecklist devices={devices} selected={null} onChange={vi.fn()} />)
    expect(screen.getByTestId('device-checklist-scroll')).toBeInTheDocument()
  })
})
