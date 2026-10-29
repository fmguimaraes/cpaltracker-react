import { useState } from 'react'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'

export type TimePreset = '30m' | '1h' | '6h' | '24h' | '7d' | '30d'

export const TIME_PRESETS: { value: TimePreset; label: string; ms: number }[] = [
  { value: '30m', label: '30 min', ms: 30 * 60_000 },
  { value: '1h', label: '1 h', ms: 60 * 60_000 },
  { value: '6h', label: '6 h', ms: 6 * 60 * 60_000 },
  { value: '24h', label: '24 h', ms: 24 * 60 * 60_000 },
  { value: '7d', label: '7 j', ms: 7 * 24 * 60 * 60_000 },
  { value: '30d', label: '30 j', ms: 30 * 24 * 60 * 60_000 },
]

/** Either a rolling preset (ending now) or an absolute custom range. */
export type TimeRangeValue =
  | { preset: TimePreset }
  | { preset: 'custom'; from: Date; to: Date }

export interface TimePickerProps {
  /** Controlled value. Omit for uncontrolled use with `defaultValue`. */
  value?: TimeRangeValue
  /** Initial value when uncontrolled (default: last 24 h). */
  defaultValue?: TimeRangeValue
  onChange?: (value: TimeRangeValue) => void
  /** Reference "now" (default: current time); pass the mock NOW for deterministic pages. */
  now?: Date
}

/** Resolves a value to absolute bounds. */
export function resolveRange(value: TimeRangeValue, now: Date = new Date()): { from: Date; to: Date } {
  if (value.preset === 'custom') return { from: value.from, to: value.to }
  const ms = TIME_PRESETS.find((p) => p.value === value.preset)!.ms
  return { from: new Date(now.getTime() - ms), to: now }
}

/** Time range picker (top right of a page): presets, custom range, prev/next arrows shifting by the span. */
export function TimePicker({ value, defaultValue = { preset: '24h' }, onChange, now }: TimePickerProps) {
  const [inner, setInner] = useState<TimeRangeValue>(defaultValue)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const current = value ?? inner
  const ref = now ?? new Date()
  const { from, to } = resolveRange(current, ref)

  const commit = (next: TimeRangeValue) => {
    if (!value) setInner(next)
    onChange?.(next)
  }
  const shift = (direction: -1 | 1) => {
    const span = to.getTime() - from.getTime()
    commit({
      preset: 'custom',
      from: new Date(from.getTime() + direction * span),
      to: new Date(to.getTime() + direction * span),
    })
  }
  const canNext = to.getTime() < ref.getTime()
  const label = `${format(from, 'dd/MM HH:mm')} → ${format(to, 'dd/MM HH:mm')}`

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Période" data-testid="time-picker">
      <Button variant="outline" size="icon-sm" aria-label="Période précédente" onClick={() => shift(-1)}>
        <ChevronLeft />
      </Button>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={current.preset === 'custom' ? '' : current.preset}
        onValueChange={(next) => next && commit({ preset: next as TimePreset })}
        aria-label="Préréglages de période"
      >
        {TIME_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset.value} value={preset.value} data-testid={`time-${preset.value}`}>
            {preset.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setDraft({ from, to })
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={current.preset === 'custom'}
            data-testid="time-custom"
            className="aria-pressed:bg-muted"
          >
            <CalendarRange />
            <span className="tabular-nums">{current.preset === 'custom' ? label : 'Personnalisé'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="range" numberOfMonths={1} selected={draft} onSelect={setDraft} />
          <div className="flex justify-end gap-2 border-t border-border p-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={!draft?.from}
              onClick={() => {
                if (!draft?.from) return
                const start = new Date(draft.from)
                start.setHours(0, 0, 0, 0)
                const end = new Date(draft.to ?? draft.from)
                end.setHours(23, 59, 59, 999)
                commit({ preset: 'custom', from: start, to: end })
                setOpen(false)
              }}
            >
              Appliquer
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button variant="outline" size="icon-sm" aria-label="Période suivante" disabled={!canNext} onClick={() => shift(1)}>
        <ChevronRight />
      </Button>
    </div>
  )
}
