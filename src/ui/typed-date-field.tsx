import * as React from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { FieldError } from "@/ui/field"
import { Input } from "@/ui/input"

/**
 * Parse a strict `YYYY-MM-DD` string into a local Date (00:00 local).
 * Returns `undefined` for wrong shape or a non-existent day (e.g. 2026-02-30).
 */
export function parseTypedDate(text: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim())
  if (!m) return undefined
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(y, mo - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return undefined
  return date
}

export interface TypedDateMessages {
  /** Shown when the text is not a real date in the expected shape. */
  invalid: string
  /** Shown when the date is before `min`. */
  tooEarly: string
  /** Shown when the date is after `max`. */
  tooLate: string
}

const DEFAULT_MESSAGES: TypedDateMessages = {
  invalid: "Enter a valid date (YYYY-MM-DD).",
  tooEarly: "Date is before the allowed range.",
  tooLate: "Date is after the allowed range.",
}

type TypedDateFieldProps = {
  value?: Date
  /** Called with a valid Date, or `undefined` when the input is emptied. Invalid text never fires it. */
  onValueChange?: (value: Date | undefined) => void
  min?: Date
  max?: Date
  disabled?: boolean
  id?: string
  className?: string
  /** Placeholder, default "YYYY-MM-DD". Pass the page's own wording (e.g. "AAAA-MM-JJ") to keep its language. */
  placeholder?: string
  /** Error wording; override per page language. */
  messages?: Partial<TypedDateMessages>
  "aria-describedby"?: string
  "aria-label"?: string
}

/**
 * Typed date entry (`YYYY-MM-DD`), for keyboard users and exact dates next to `DateRangePicker`.
 * Validates on blur (and live once an error is showing); the error is linked via aria-describedby.
 * Put it under a `Field` + `FieldLabel htmlFor={id}`.
 */
function TypedDateField({
  value,
  onValueChange,
  min,
  max,
  disabled,
  id,
  className,
  placeholder = "YYYY-MM-DD",
  messages,
  "aria-describedby": describedBy,
  "aria-label": ariaLabel,
}: TypedDateFieldProps) {
  const generated = React.useId()
  const errId = `${id ?? generated}-typed-err`
  const msg = { ...DEFAULT_MESSAGES, ...messages }
  const [draft, setDraft] = React.useState(value ? format(value, "yyyy-MM-dd") : "")
  const [error, setError] = React.useState<string | null>(null)
  const [prev, setPrev] = React.useState(value)

  // Sync draft when the controlled value changes from outside (e.g. a calendar).
  if (value?.getTime() !== prev?.getTime()) {
    setPrev(value)
    if (value?.getTime() !== parseTypedDate(draft)?.getTime()) {
      setDraft(value ? format(value, "yyyy-MM-dd") : "")
      setError(null)
    }
  }

  function check(text: string): { date?: Date; error: string | null } {
    if (text.trim() === "") return { error: null }
    const date = parseTypedDate(text)
    if (!date) return { error: msg.invalid }
    if (min && date < min) return { error: msg.tooEarly }
    if (max && date > max) return { error: msg.tooLate }
    return { date, error: null }
  }

  function onChange(text: string) {
    setDraft(text)
    const r = check(text)
    if (r.error === null) {
      setError(null)
      onValueChange?.(r.date)
    } else if (error) {
      setError(r.error) // live feedback once an error is displayed
    }
  }

  return (
    <div data-slot="typed-date-field" className={cn("flex w-full flex-col gap-1.5", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(describedBy, error && errId) || undefined}
        maxLength={10}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setError(check(draft).error)}
        className="font-mono tabular-nums"
      />
      {error ? <FieldError id={errId}>{error}</FieldError> : null}
    </div>
  )
}

export { TypedDateField }
