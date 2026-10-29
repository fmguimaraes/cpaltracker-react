import { useEffect, useRef, useState } from 'react'
import { Button } from '@/ui/button'
import { Field, FieldError, FieldLabel } from '@/ui/field'
import { TypedDateField } from '@/ui/typed-date-field'
import {
  END_DATE_INVALID_MESSAGE,
  formatIsoDate,
  START_DATE_INVALID_MESSAGE,
  validateDateRangeInputs,
} from './dateRange'
import { utcDayToLocal } from './timeRange'

/**
 * KAN-170 (FR5-FR8, NFR4) — the History Dashboard's typed date-range entry
 * (K-5, FR7 of React-History-Dashboard kept), built on the kit's
 * `TypedDateField` (`AAAA-MM-JJ`, French wording passed through `messages` /
 * `placeholder`). It sits next to the header `TimePicker` (calendar and
 * presets); both end in the same `onApply`.
 *
 * Validation still runs synchronously on submit, before `onApply` is ever
 * called (FR5) — an invalid range never reaches the caller, so it can never
 * reach the history fetch either. Field errors (`start`/`end`) are the typed
 * field's own, range-level errors (reversed/over-span) are shown here, both
 * inline next to the inputs (NFR4); the over-span message names the limit
 * (FR8). A one-sided or empty range is valid (unbounded side).
 *
 * Plain text, not `<input type="date">`: FR7 requires the field to be able to
 * REJECT a malformed date, which a native picker would make unreachable.
 *
 * The kit field does not forward `data-testid` yet (see the story's lead
 * request), so the stable test ids of the inputs and of their error lines are
 * stamped on the DOM nodes the kit renders by `useStampedTestIds`.
 */

/** Stamps `data-testid` on kit-rendered nodes found by selector, now and whenever the form's subtree changes. */
function useStampedTestIds(ref: React.RefObject<HTMLElement | null>, stamps: Record<string, string>) {
  const key = JSON.stringify(stamps)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const entries = Object.entries(JSON.parse(key) as Record<string, string>)
    const apply = () => {
      for (const [selector, testId] of entries) {
        root.querySelector(selector)?.setAttribute('data-testid', testId)
      }
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [ref, key])
}

export function DateRangePicker({
  initialStart = null,
  initialEnd = null,
  onApply,
}: {
  initialStart?: Date | null
  initialEnd?: Date | null
  onApply: (range: { start: Date | null; end: Date | null }) => void
}) {
  const formRef = useRef<HTMLFormElement | null>(null)
  // Raw text of both fields (the kit field only reports VALID dates; apply must also see invalid text).
  const [raw, setRaw] = useState({
    start: initialStart ? formatIsoDate(initialStart) : '',
    end: initialEnd ? formatIsoDate(initialEnd) : '',
  })
  const [rangeError, setRangeError] = useState<string | null>(null)

  useStampedTestIds(formRef, {
    '#date-range-start': 'date-range-start',
    '#date-range-end': 'date-range-end',
    '#date-range-start-typed-err': 'date-range-start-error',
    '#date-range-end-typed-err': 'date-range-end-error',
  })

  function handleChange(event: React.ChangeEvent<HTMLFormElement>) {
    const target = event.target as unknown as HTMLInputElement
    if (target.id === 'date-range-start') setRaw((current) => ({ ...current, start: target.value }))
    if (target.id === 'date-range-end') setRaw((current) => ({ ...current, end: target.value }))
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setRangeError(null)

    const result = validateDateRangeInputs(raw.start, raw.end)
    if (!result.ok) {
      if (result.error.field === 'range') {
        setRangeError(result.error.message)
      } else {
        // Make the typed field show its own error now (it validates on blur) without moving focus.
        const input = formRef.current?.querySelector(`#date-range-${result.error.field}`)
        input?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      }
      return
    }

    onApply({ start: result.start, end: result.end })
  }

  const describedBy = rangeError ? 'date-range-error' : undefined

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={handleChange}
      className="flex flex-wrap items-start gap-3 text-sm"
      data-testid="date-range-picker"
    >
      <Field className="w-auto">
        <FieldLabel htmlFor="date-range-start">Du</FieldLabel>
        <TypedDateField
          id="date-range-start"
          className="w-40"
          placeholder="AAAA-MM-JJ"
          value={initialStart ? utcDayToLocal(initialStart) : undefined}
          messages={{ invalid: START_DATE_INVALID_MESSAGE }}
          aria-describedby={describedBy}
        />
      </Field>

      <Field className="w-auto">
        <FieldLabel htmlFor="date-range-end">Au</FieldLabel>
        <TypedDateField
          id="date-range-end"
          className="w-40"
          placeholder="AAAA-MM-JJ"
          value={initialEnd ? utcDayToLocal(initialEnd) : undefined}
          messages={{ invalid: END_DATE_INVALID_MESSAGE }}
          aria-describedby={describedBy}
        />
      </Field>

      <Button type="submit" variant="outline" data-testid="date-range-apply" className="self-end">
        Appliquer
      </Button>

      {rangeError && (
        <FieldError id="date-range-error" data-testid="date-range-error" className="basis-full">
          {rangeError}
        </FieldError>
      )}
    </form>
  )
}
