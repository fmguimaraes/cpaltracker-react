import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { addMonths, endOfMonth, format, isValid, parse, startOfMonth, startOfYear } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { fr as frCalendar } from 'react-day-picker/locale'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'
import { cn } from '@/lib/utils'

/**
 * The app's one preset set, on every page that has a period (owner 2026-11-25: 1j · 7j · 15j · 1 mois, the
 * default being 1 mois = 30 days). Same values as a subset of `TimePreset` (`24h` = 1 day).
 */
export type PeriodPreset = '24h' | '7d' | '15d' | '30d'

export const PERIOD_PRESETS: { value: PeriodPreset; label: string; days: number }[] = [
  { value: '24h', label: '1 j', days: 1 },
  { value: '7d', label: '7 j', days: 7 },
  { value: '15d', label: '15 j', days: 15 },
  { value: '30d', label: '1 mois', days: 30 },
]

/** The shared preset of a `TimePreset`, or null when it is not one of the set. */
export function periodPresetOf(value: string): PeriodPreset | null {
  return PERIOD_PRESETS.some((p) => p.value === value) ? (value as PeriodPreset) : null
}

/**
 * The app's one selected-segment style, for every segmented control (period presets, replay speeds, theme).
 * The track is --surface-subtle and the others are --text-secondary. Owner feedback 2026-11-25: the selected
 * segment takes the primary fill (anthracite in light, teal in dark, both with their AA foreground) at 600, so
 * it reads as selected; the earlier elevated-surface segment read as unselected next to the outlined ones.
 */
export const SELECTED_TOGGLE =
  'text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90 data-[state=on]:hover:text-primary-foreground'

/** "1 nov. – 15 nov." (local days, fr-FR; the year only when it is not the current one). */
export function formatDayRange(from: Date, to: Date, now: Date = new Date()): string {
  const day = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    }).format(date)
  const start = day(from)
  const end = day(to)
  return start === end ? start : `${start} – ${end}`
}

/** Month-aligned shortcuts of the custom range, relative to `now`; the current month ends today. */
export function monthShortcuts(now: Date = new Date()): { key: string; label: string; from: Date; to: Date }[] {
  const thisMonth = startOfMonth(now)
  return [
    { key: 'this-month', label: 'Ce mois', from: thisMonth, to: now },
    { key: 'last-month', label: 'Mois dernier', from: addMonths(thisMonth, -1), to: endOfMonth(addMonths(thisMonth, -1)) },
    { key: '3-months', label: '3 derniers mois', from: addMonths(thisMonth, -2), to: now },
    { key: '6-months', label: '6 derniers mois', from: addMonths(thisMonth, -5), to: now },
    { key: 'this-year', label: 'Cette année', from: startOfYear(now), to: now },
  ]
}

const DAY_FORMAT = 'dd/MM/yyyy'

/** A typed "jj/mm/aaaa" day, or null when it is not a real date. */
export function parseDay(text: string): Date | null {
  const day = parse(text.trim(), DAY_FORMAT, new Date(), { locale: fr })
  return isValid(day) && day.getFullYear() >= 1000 ? day : null
}

function wideScreen(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 768px)').matches
    : true
}

export interface PeriodControlProps {
  /** The active preset; `null` = a custom range (`custom`). */
  preset: PeriodPreset | null
  /** The current range, shown on the "Personnalisé" button when custom and preselected in its calendar. */
  range: { from: Date; to: Date }
  onPreset: (preset: PeriodPreset) => void
  /** A picked range of whole local days: `from` at 00:00, `to` at 23:59:59.999. */
  onCustom: (from: Date, to: Date) => void
  /** data-testid prefix: `{testId}` on the group, `{testId}-{preset}`, `{testId}-custom`. */
  testId?: string
  className?: string
  /**
   * `icon`: the custom-range button is the 📅 icon alone (aria-label "Période personnalisée"), its range shown
   * only once a custom range is applied (the Pulse timeline bar). Default `full`: icon + "Personnalisé".
   */
  customButton?: 'full' | 'icon'
}

/**
 * The period control of the top bar: segmented presets [1j | 7j | 15j | 1 mois] (elevated segment when selected) and
 * "Personnalisé", a local-day range calendar with Annuler / Appliquer.
 */
export function PeriodControl({
  preset,
  range,
  onPreset,
  onCustom,
  testId = 'period',
  className,
  customButton = 'full',
}: PeriodControlProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const [month, setMonth] = useState<Date>(() => startOfMonth(range.from))
  const [fromText, setFromText] = useState('')
  const [toText, setToText] = useState('')
  const [months, setMonths] = useState(2)
  const custom = preset === null
  const now = new Date()
  const fromInvalid = fromText.trim() !== '' && parseDay(fromText) === null
  const toInvalid = toText.trim() !== '' && parseDay(toText) === null

  function showRange(next: DateRange | undefined) {
    setDraft(next)
    setFromText(next?.from ? format(next.from, DAY_FORMAT) : '')
    setToText(next?.to ? format(next.to, DAY_FORMAT) : '')
  }

  function commitTyped(edge: 'from' | 'to') {
    const day = parseDay(edge === 'from' ? fromText : toText)
    if (!day) return
    let from = edge === 'from' ? day : draft?.from
    let to = edge === 'to' ? day : draft?.to
    if (from && to && from > to) [from, to] = [to, from]
    showRange({ from: from ?? day, to })
    setMonth(startOfMonth(edge === 'to' && months > 1 ? addMonths(day, 1 - months) : day))
  }

  function apply() {
    const from = parseDay(fromText) ?? draft?.from
    if (!from) return
    let to = parseDay(toText) ?? draft?.to ?? from
    let start = from
    if (start > to) [start, to] = [to, start]
    const startDay = new Date(start)
    startDay.setHours(0, 0, 0, 0)
    const endDay = new Date(to)
    endDay.setHours(23, 59, 59, 999)
    onCustom(startDay, endDay)
    setOpen(false)
  }
  return (
    <div role="group" aria-label="Période" className={cn('flex shrink-0 items-center gap-1.5', className)} data-testid={testId}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={preset ?? ''}
        onValueChange={(next) => next && onPreset(next as PeriodPreset)}
        aria-label="Préréglages de période"
        className="bg-muted"
      >
        {PERIOD_PRESETS.map((p) => (
          <ToggleGroupItem key={p.value} value={p.value} className={cn('whitespace-nowrap', SELECTED_TOGGLE)} data-testid={`${testId}-${p.value}`}>
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) return
          const count = wideScreen() ? 2 : 1
          setMonths(count)
          showRange({ from: range.from, to: range.to })
          setMonth(startOfMonth(count > 1 && range.to >= addMonths(startOfMonth(range.from), 1) ? addMonths(range.to, -1) : range.from))
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={customButton === 'icon' && !custom ? 'icon-sm' : 'sm'}
            aria-label={customButton === 'icon' && !custom ? 'Période personnalisée' : undefined}
            aria-pressed={custom}
            data-state={custom ? 'on' : 'off'}
            data-testid={`${testId}-custom`}
            className={cn('whitespace-nowrap', SELECTED_TOGGLE)}
            title={custom ? `Personnalisé · ${formatDayRange(range.from, range.to)}` : 'Période personnalisée'}
          >
            <CalendarRange aria-hidden />
            {(custom || customButton === 'full') && (
              <span className={cn('tabular-nums', !custom && 'max-xl:sr-only')}>
                {custom ? formatDayRange(range.from, range.to) : 'Personnalisé'}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] p-0" align="end" data-testid={`${testId}-custom-panel`}>
          <div className="flex flex-col md:flex-row">
            <div
              role="group"
              aria-label="Raccourcis"
              className="flex flex-wrap gap-1 border-b border-border p-2 md:w-40 md:flex-col md:flex-nowrap md:border-r md:border-b-0"
            >
              {monthShortcuts(now).map((s) => (
                <Button
                  key={s.key}
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  data-testid={`${testId}-shortcut-${s.key}`}
                  onClick={() => {
                    showRange({ from: s.from, to: s.to })
                    setMonth(startOfMonth(months > 1 ? addMonths(s.to, -1) : s.from))
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-col">
              <div className="flex gap-2 px-3 pt-3">
                {(['from', 'to'] as const).map((edge) => {
                  const id = `${testId}-custom-${edge}`
                  const invalid = edge === 'from' ? fromInvalid : toInvalid
                  return (
                    <div key={edge} className="flex flex-1 flex-col gap-1">
                      <Label htmlFor={id}>{edge === 'from' ? 'Du' : 'Au'}</Label>
                      <Input
                        id={id}
                        data-testid={id}
                        inputMode="numeric"
                        placeholder="jj/mm/aaaa"
                        className="h-8 tabular-nums"
                        aria-invalid={invalid || undefined}
                        value={edge === 'from' ? fromText : toText}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => (edge === 'from' ? setFromText : setToText)(e.target.value)}
                        onBlur={() => commitTyped(edge)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          commitTyped(edge)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <Calendar
                mode="range"
                locale={frCalendar}
                numberOfMonths={months}
                showOutsideDays={months === 1}
                captionLayout="dropdown"
                startMonth={new Date(now.getFullYear() - 5, 0)}
                endMonth={new Date(now.getFullYear() + 3, 11)}
                month={month}
                onMonthChange={setMonth}
                resetOnSelect
                selected={draft}
                onSelect={showRange}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border p-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={!draft?.from || fromInvalid || toInvalid}
              data-testid={`${testId}-custom-apply`}
              onClick={apply}
            >
              Appliquer
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
