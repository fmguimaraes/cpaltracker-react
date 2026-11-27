import { useId, useMemo, useRef, useState } from 'react'
import { ChevronDown, LocateFixed } from 'lucide-react'
import type { Position } from '../api/positions'
import { formatAbsolute, formatLocalIso, formatRelative } from '../anomalies/anomalyCard'
import { STATE_LABEL, STATES } from '../live-tracking/fleetModel'
import { positionStatus } from '../live-tracking/markerStyle'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Label } from '@/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { SearchInput } from '@/ui/search-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { countByStatus, statusTone } from '@/ui/status'
import { cn } from '@/lib/utils'

export const ALL_LOTS = 'all'

/** "6 palettes · 5 OK · 1 Alerte" — the fleet summary ported from Suivi en direct (zero counts left out). */
export function fleetSummary(positions: Position[]): string {
  const counts = countByStatus(positions.map((p) => ({ status: positionStatus(p) })))
  const total = `${positions.length} ${positions.length > 1 ? 'palettes' : 'palette'}`
  return [total, ...STATES.filter((state) => counts[state] > 0).map((state) => `${counts[state]} ${STATE_LABEL[state]}`)].join(' · ')
}

function lastReading(position: Position, now: Date): { text: string; title: string } | null {
  if (!position.timestamp) return null
  const date = new Date(position.timestamp)
  if (Number.isNaN(date.getTime())) return null
  return { text: formatRelative(date, now), title: `${formatAbsolute(date, now)} (${formatLocalIso(date)})` }
}

/**
 * The Pulse top bar's one pallet-selection pattern (replaces the footer chips): "Palettes {visible}/{total} ▾"
 * opening a popover with the fleet summary, the lot filter (when the snapshot has lots), a search,
 * "Tout sélectionner / Aucune", and one row per pallet of the lot — checkbox (hide/show on the map and in the
 * anomalies), name, state dot, last reading (relative, absolute in the tooltip) and ⌖ "Localiser" (fly to it
 * and open its drawer; a hidden pallet is shown again first). `positions` = the lot's pallets.
 */
export function PalletSelector({
  positions,
  hidden,
  onToggle,
  onSetMany,
  onLocate,
  locatable,
  selectedChipId = null,
  lots,
  lot,
  onLotChange,
  now,
}: {
  positions: Position[]
  hidden: ReadonlySet<string>
  onToggle: (chipId: string, shown: boolean) => void
  onSetMany: (chipIds: string[], shown: boolean) => void
  onLocate: (chipId: string) => void
  /** Pallets with a position to fly to (period / instant). */
  locatable: ReadonlySet<string>
  selectedChipId?: string | null
  lots: Array<[string, string]>
  lot: string
  onLotChange: (lot: string) => void
  now?: Date
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const total = positions.length
  const visible = positions.filter((p) => !hidden.has(p.chipId)).length
  const lotLabel = lots.find(([id]) => id === lot)?.[1]
  const needle = query.trim().toLowerCase()
  const rows = useMemo(
    () => (needle ? positions.filter((p) => p.chipId.toLowerCase().includes(needle)) : positions),
    [positions, needle],
  )
  const reference = now ?? new Date()
  const rowIds = rows.map((p) => p.chipId)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 tabular-nums"
          data-testid="pulse-pallets"
          title={lotLabel ? `Lot client : ${lotLabel}` : undefined}
        >
          Palettes {visible}/{total}
          {lotLabel && (
            <>
              <span aria-hidden className="size-1.5 rounded-full bg-signal" data-testid="pulse-pallets-lot-mark" />
              <span className="sr-only">, filtré par lot</span>
            </>
          )}
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-80 flex-col gap-3 p-3"
        data-testid="pulse-pallets-popover"
        // Focus the search on open, without scrolling the page or the list (Radix would focus the first
        // focusable — the lot filter or a checkbox — and scroll it into view).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchRef.current?.focus({ preventScroll: true })
        }}
      >
        <p className="text-sm font-medium" data-testid="pulse-fleet-summary">
          {fleetSummary(positions)}
        </p>
        {lots.length > 0 && (
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lot client</Label>
            <Select value={lot} onValueChange={onLotChange}>
              <SelectTrigger size="sm" className="min-w-0 flex-1" data-testid="pulse-lot-filter" aria-label="Filtrer par lot client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL_LOTS}>Tous les lots</SelectItem>
                {lots.map(([id, label]) => (
                  <SelectItem key={id} value={id} data-testid={`pulse-lot-option-${id}`}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <SearchInput
          ref={searchRef}
          value={query}
          onValueChange={setQuery}
          label="Rechercher une palette"
          placeholder="Rechercher une palette…"
          className="max-w-none"
          data-testid="pulse-pallets-search"
        />
        <div className="flex items-center justify-between gap-2 text-sm">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            disabled={rows.length === 0}
            onClick={() => onSetMany(rowIds, true)}
            data-testid="pulse-pallets-all"
          >
            Tout sélectionner
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            disabled={rows.length === 0}
            onClick={() => onSetMany(rowIds, false)}
            data-testid="pulse-pallets-none"
          >
            Aucune
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground" data-testid="pulse-pallets-no-match">
            {total === 0 ? 'Aucune palette.' : 'Aucune palette ne correspond.'}
          </p>
        ) : (
          <ul id={listId} aria-label="Palettes" className="-mx-1 flex max-h-72 flex-col overflow-y-auto" data-testid="pulse-pallets-list">
            {rows.map((position) => {
              const { chipId } = position
              const shown = !hidden.has(chipId)
              const status = positionStatus(position)
              const last = lastReading(position, reference)
              const checkboxId = `${listId}-${chipId}`
              return (
                <li
                  key={chipId}
                  data-testid={`pulse-pallet-row-${chipId}`}
                  data-selected={chipId === selectedChipId}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-md px-1 py-1',
                    chipId === selectedChipId && 'bg-primary-soft',
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={shown}
                    onCheckedChange={(checked) => onToggle(chipId, checked === true)}
                    data-testid={`pulse-pallet-check-${chipId}`}
                  />
                  <Label htmlFor={checkboxId} className="flex min-w-0 flex-1 items-center gap-2 font-normal">
                    <span className="min-w-0 truncate font-medium" title={chipId}>
                      {chipId}
                    </span>
                    <span
                      className={cn('size-2 shrink-0 rounded-full', statusTone[status].dot)}
                      title={STATE_LABEL[status]}
                      data-testid={`pulse-pallet-status-${chipId}`}
                      data-status={status}
                    />
                    <span className="sr-only">{STATE_LABEL[status]}</span>
                  </Label>
                  {last && (
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground" title={last.title}>
                      {last.text}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    aria-label={`Localiser ${chipId}`}
                    title="Localiser"
                    disabled={!locatable.has(chipId)}
                    onClick={() => {
                      onLocate(chipId)
                      setOpen(false)
                    }}
                    data-testid={`pulse-pallet-locate-${chipId}`}
                  >
                    <LocateFixed aria-hidden />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
