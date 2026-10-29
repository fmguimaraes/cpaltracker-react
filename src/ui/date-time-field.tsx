import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/ui/button"
import { Calendar } from "@/ui/calendar"
import { Input } from "@/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover"

type DateTimeFieldProps = {
  value?: Date
  onValueChange?: (value: Date | undefined) => void
  disabled?: boolean
  id?: string
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  /** Prefix for the accessible names of the two controls. */
  label?: string
  /** Localised strings; missing keys fall back to English. */
  labels?: {
    /** Suffix of the date button name: `${label} ${dateSuffix}`. Default "date". */
    dateSuffix?: string
    /** Suffix of the time input name. Default "time". */
    timeSuffix?: string
    placeholder?: string
  }
  /** Formats the chosen day for display. Default "d MMM yyyy" (English). */
  formatDate?: (value: Date) => string
}

/** Date and time as two adjacent bordered fields: a calendar popover and a native time input. */
function DateTimeField({ value, onValueChange, disabled, id, className, label = "Date", labels, formatDate, ...aria }: DateTimeFieldProps) {
  const [open, setOpen] = React.useState(false)
  const dateSuffix = labels?.dateSuffix ?? "date"
  const timeSuffix = labels?.timeSuffix ?? "time"
  const time = value ? format(value, "HH:mm") : ""

  function setDay(day: Date | undefined) {
    if (!day) return onValueChange?.(undefined)
    const next = new Date(day)
    next.setHours(value?.getHours() ?? 0, value?.getMinutes() ?? 0, 0, 0)
    onValueChange?.(next)
  }
  function setTime(t: string) {
    if (!/^\d{2}:\d{2}/.test(t)) return
    const [h, m] = t.split(":").map(Number)
    const next = new Date(value ?? new Date())
    next.setHours(h, m ?? 0, 0, 0)
    onValueChange?.(next)
  }

  return (
    <div data-slot="date-time-field" className={cn("flex w-full gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={`${label} ${dateSuffix}`}
            className={cn("min-w-0 flex-1 justify-start font-normal", !value && "text-muted-foreground")}
            {...aria}
          >
            <CalendarIcon aria-hidden="true" />
            <span className="truncate">{value ? (formatDate ?? ((d) => format(d, "d MMM yyyy")))(value) : (labels?.placeholder ?? "Pick a date")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar mode="single" selected={value} onSelect={(d) => { setDay(d); setOpen(false) }} defaultMonth={value} />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        value={time}
        disabled={disabled}
        aria-label={`${label} ${timeSuffix}`}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        onChange={(e) => setTime(e.target.value)}
        className="w-28 shrink-0 font-mono [&::-webkit-calendar-picker-indicator]:dark:invert"
      />
    </div>
  )
}

export { DateTimeField }
