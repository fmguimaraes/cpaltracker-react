import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadLegend } from './LoadLegend'

describe('LoadLegend', () => {
  it('is a scale of the state colours by % of the initial weight, with the grey for no reference', () => {
    render(<LoadLegend />)
    const legend = screen.getByTestId('load-legend')
    expect(legend).toHaveTextContent('Poids restant transporté')
    const segments = Array.from(legend.querySelectorAll('[data-status]'))
    expect(segments.map((s) => s.getAttribute('data-status'))).toEqual(['alert', 'warning', 'ok'])
    // Widths on a 10-column grid: 0–20 %, 20–50 %, 50–100 %.
    expect(segments.map((s) => s.className.match(/col-span-\d+/)?.[0])).toEqual(['col-span-2', 'col-span-3', 'col-span-5'])
    for (const label of ['0 %', '20 %', '50 %', '100 %', 'vide', 'poids initial', 'sans mesure ou sans poids initial']) {
      expect(legend).toHaveTextContent(label)
    }
  })
})
