import { render, screen } from '@testing-library/react'
import { DeviceListSkeleton } from './DeviceListSkeleton'

describe('DeviceListSkeleton (FR19, FR23)', () => {
  it('is one announced status region with a table shape and a cards shape', () => {
    render(<DeviceListSkeleton />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByTestId('pilotage-loading')).toHaveTextContent('Chargement du pilotage…')
    expect(screen.getByTestId('pilotage-loading-table')).toBeInTheDocument()
    expect(screen.getByTestId('pilotage-loading-cards')).toBeInTheDocument()
  })
})
