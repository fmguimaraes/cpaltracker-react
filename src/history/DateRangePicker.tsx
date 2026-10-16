import { useState } from 'react'
import { formatIsoDate, validateDateRangeInputs } from './dateRange'

/**
 * KAN-170 (FR5-FR8, NFR4) — the History Dashboard's date-range inputs.
 *
 * Validation runs synchronously on submit, before `onApply` is ever
 * called (FR5) — an invalid range never reaches the caller, so it can
 * never reach the history fetch either. Errors are field-specific
 * (`start`/`end`) or range-level (reversed/over-span), shown inline next
 * to the relevant input (NFR4), and name both the problem and the limit
 * for the over-span case (FR8).
 *
 * Plain text inputs, not `<input type="date">`: FR7 requires this
 * component to actually be ABLE to reject a malformed/unparseable date —
 * a native date input's own picker UI makes most malformed values
 * impossible to enter in the first place, which would leave FR7's error
 * path unreachable through the UI (CB6 is legacy's own free-text date
 * field, which is exactly what let a bad value reach the server there).
 */
export function DateRangePicker({
  initialStart = null,
  initialEnd = null,
  onApply,
}: {
  initialStart?: Date | null
  initialEnd?: Date | null
  onApply: (range: { start: Date | null; end: Date | null }) => void
}) {
  const [startInput, setStartInput] = useState(initialStart ? formatIsoDate(initialStart) : '')
  const [endInput, setEndInput] = useState(initialEnd ? formatIsoDate(initialEnd) : '')
  const [fieldError, setFieldError] = useState<{ field: 'start' | 'end'; message: string } | null>(null)
  const [rangeError, setRangeError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFieldError(null)
    setRangeError(null)

    const result = validateDateRangeInputs(startInput, endInput)
    if (!result.ok) {
      if (result.error.field === 'range') {
        setRangeError(result.error.message)
      } else {
        setFieldError({ field: result.error.field, message: result.error.message })
      }
      return
    }

    onApply({ start: result.start, end: result.end })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 text-sm" data-testid="date-range-picker">
      <label className="flex flex-col gap-1" style={{ color: 'var(--color-text)' }}>
        Du
        <input
          type="text"
          inputMode="numeric"
          placeholder="AAAA-MM-JJ"
          value={startInput}
          onChange={(event) => setStartInput(event.target.value)}
          data-testid="date-range-start"
          aria-invalid={fieldError?.field === 'start'}
        />
      </label>
      {fieldError?.field === 'start' && (
        <p role="alert" data-testid="date-range-start-error" style={{ color: 'var(--color-danger)' }}>
          {fieldError.message}
        </p>
      )}

      <label className="flex flex-col gap-1" style={{ color: 'var(--color-text)' }}>
        Au
        <input
          type="text"
          inputMode="numeric"
          placeholder="AAAA-MM-JJ"
          value={endInput}
          onChange={(event) => setEndInput(event.target.value)}
          data-testid="date-range-end"
          aria-invalid={fieldError?.field === 'end'}
        />
      </label>
      {fieldError?.field === 'end' && (
        <p role="alert" data-testid="date-range-end-error" style={{ color: 'var(--color-danger)' }}>
          {fieldError.message}
        </p>
      )}

      <button
        type="submit"
        data-testid="date-range-apply"
        className="rounded-md border px-3 py-1"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
      >
        Appliquer
      </button>

      {rangeError && (
        <p role="alert" data-testid="date-range-error" style={{ color: 'var(--color-danger)' }}>
          {rangeError}
        </p>
      )}
    </form>
  )
}
