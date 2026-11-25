import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { fr } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/ui/button'
import { Calendar } from '@/ui/calendar'
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
  const custom = preset === null
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
          if (next) setDraft({ from: range.from, to: range.to })
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
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="range" locale={fr} numberOfMonths={1} selected={draft} onSelect={setDraft} defaultMonth={draft?.from} />
          <div className="flex justify-end gap-2 border-t border-border p-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={!draft?.from}
              data-testid={`${testId}-custom-apply`}
              onClick={() => {
                if (!draft?.from) return
                const start = new Date(draft.from)
                start.setHours(0, 0, 0, 0)
                const end = new Date(draft.to ?? draft.from)
                end.setHours(23, 59, 59, 999)
                onCustom(start, end)
                setOpen(false)
              }}
            >
              Appliquer
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
