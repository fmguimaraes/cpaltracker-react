import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DateRangePicker } from './DateRangePicker'

function setDates(start: string, end: string) {
  fireEvent.change(screen.getByTestId('date-range-start'), { target: { value: start } })
  fireEvent.change(screen.getByTestId('date-range-end'), { target: { value: end } })
}

describe('DateRangePicker (KAN-170 FR5-FR8, NFR4)', () => {
  it('calls onApply with the parsed dates for a valid range, with no error shown', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    setDates('2026-01-01', '2026-02-01')
    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(onApply).toHaveBeenCalledTimes(1)
    const call = onApply.mock.calls[0][0]
    expect(call.start?.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(call.end?.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('calls onApply with both bounds null for an empty range (no error — FR3 default applies elsewhere)', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(onApply).toHaveBeenCalledWith({ start: null, end: null })
  })

  it('rejects a reversed range with a clear error and does NOT call onApply (FR5, FR6)', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    setDates('2026-06-01', '2026-01-01')
    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByTestId('date-range-error')).toBeInTheDocument()
  })

  it('rejects a malformed start date, naming the field, and does NOT call onApply (FR5, FR7)', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    setDates('2026-02-30', '2026-03-01')
    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByTestId('date-range-start-error')).toBeInTheDocument()
    expect(screen.getByTestId('date-range-start')).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a malformed end date, naming the field, and does NOT call onApply (FR5, FR7)', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    setDates('2026-01-01', 'garbage')
    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByTestId('date-range-end-error')).toBeInTheDocument()
  })

  it('rejects an over-maximum span, stating the limit, and does NOT call onApply (FR5, FR8)', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    setDates('2025-01-01', '2026-06-01')
    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(onApply).not.toHaveBeenCalled()
    const error = screen.getByTestId('date-range-error')
    expect(error).toBeInTheDocument()
    expect(error.textContent).toMatch(/1 an/)
  })

  it('clears a prior error once a corrected range is submitted', () => {
    const onApply = vi.fn()
    render(<DateRangePicker onApply={onApply} />)

    setDates('2026-06-01', '2026-01-01')
    fireEvent.click(screen.getByTestId('date-range-apply'))
    expect(screen.getByTestId('date-range-error')).toBeInTheDocument()

    setDates('2026-01-01', '2026-02-01')
    fireEvent.click(screen.getByTestId('date-range-apply'))

    expect(screen.queryByTestId('date-range-error')).not.toBeInTheDocument()
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('pre-fills the inputs from initialStart/initialEnd', () => {
    render(
      <DateRangePicker
        initialStart={new Date(Date.UTC(2026, 0, 1))}
        initialEnd={new Date(Date.UTC(2026, 1, 1))}
        onApply={vi.fn()}
      />,
    )

    expect(screen.getByTestId('date-range-start')).toHaveValue('2026-01-01')
    expect(screen.getByTestId('date-range-end')).toHaveValue('2026-02-01')
  })
})
