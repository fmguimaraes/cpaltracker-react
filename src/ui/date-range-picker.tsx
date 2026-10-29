import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { cn } from "@/lib/utils"

import { Button } from "@/ui/button"
import { Calendar } from "@/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover"

type DateRangePickerProps = {
  value?: DateRange
  onValueChange?: (value: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-label"?: string
}

/** Range picker: bordered trigger + two-month calendar popover. */
function DateRangePicker({ value, onValueChange, placeholder = "Pick a date range", disabled, id, className, ...aria }: DateRangePickerProps) {
  const text = value?.from
    ? value.to
      ? `${format(value.from, "d MMM yyyy")} – ${format(value.to, "d MMM yyyy")}`
      : format(value.from, "d MMM yyyy")
    : placeholder

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          data-slot="date-range-picker"
          className={cn("w-full justify-start font-normal", !value?.from && "text-muted-foreground", className)}
          {...aria}
        >
          <CalendarIcon aria-hidden="true" />
          <span className="truncate">{text}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] overflow-x-auto p-0">
        <Calendar mode="range" numberOfMonths={2} selected={value} onSelect={onValueChange} defaultMonth={value?.from} />
      </PopoverContent>
    </Popover>
  )
}

export { DateRangePicker }
export type { DateRange }
