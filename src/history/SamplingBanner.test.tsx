import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SamplingBanner } from './SamplingBanner'

describe('SamplingBanner (KAN-175 FR22, CB10, CB11)', () => {
  it('renders nothing when the response is not sampled', () => {
    const { container } = render(<SamplingBanner sampled={false} count={100} total={100} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names both the post- and pre-sampling counts when sampled', () => {
    render(<SamplingBanner sampled={true} count={25000} total={80000} />)
    const banner = screen.getByTestId('history-sampling-banner')
    expect(banner).toHaveTextContent('25000')
    expect(banner).toHaveTextContent('80000')
  })
})
