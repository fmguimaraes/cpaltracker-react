import { render, screen } from '@testing-library/react'
import { SkeletonRows } from './skeleton-rows'

describe('SkeletonRows', () => {
  it('announces itself and draws the requested number of rows (FR23)', () => {
    const { container } = render(<SkeletonRows label="Chargement des anomalies…" rows={3} testId="s" />)
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des anomalies…')
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
  })
})
