import { Activity, Droplet, MapPin, Thermometer, TriangleAlert, Weight, type LucideIcon } from 'lucide-react'
import type { AnomalyRow } from '../api/anomalies'
import { anomalyCardContent, cardHeadline, isClosed, type TypeKey } from './anomalyCard'
import { StatusPill } from './StatusPill'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/utils'

/** One icon per anomaly type (cards and type chips). */
export const TYPE_ICON: Record<TypeKey, LucideIcon> = {
  temperature: Thermometer,
  humidity: Droplet,
  shock: Activity,
  mass: Weight,
  geofence: MapPin,
  other: TriangleAlert,
}

/** The anomaly a card stands for, as the host needs it to drive the map. */
export type AnomalySelection = Pick<AnomalyRow, 'anomalyKey' | 'chipId'>

function AnomalyCard({
  row,
  showName,
  selected,
  onSelect,
  onHover,
  onOpen,
}: {
  row: AnomalyRow
  showName: boolean
  selected: boolean
  onSelect?: (row: AnomalySelection) => void
  onHover?: (chipId: string | null) => void
  onOpen: (anomalyKey: string) => void
}) {
  const card = anomalyCardContent(row, { showName })
  const Icon = TYPE_ICON[card.rule?.kind ?? 'other']
  const toHandle = row.status === 'detectee'
  const closed = isClosed(row.status)
  const headline = cardHeadline(card)
  const details = card.details.join(' · ')
  // Without a host selection (no map to drive), a card opens the detail directly.
  const activate = () => (onSelect ? onSelect({ anomalyKey: row.anomalyKey, chipId: row.chipId }) : onOpen(row.anomalyKey))

  return (
    <li className="flex flex-col gap-1" data-testid={`anomaly-row-${row.anomalyKey}`} data-status={row.status}>
      <Button
        variant="outline"
        aria-pressed={onSelect ? selected : undefined}
        className={cn(
          'h-auto w-full min-w-0 flex-col items-stretch gap-0.5 border-l-4 border-l-border px-2 py-1.5 text-left font-normal whitespace-normal',
          selected && 'bg-muted ring-2 ring-ring',
          closed && 'text-muted-foreground',
        )}
        onClick={activate}
        onMouseEnter={() => onHover?.(row.chipId)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(row.chipId)}
        onBlur={() => onHover?.(null)}
        data-testid={`anomaly-card-${row.anomalyKey}`}
      >
        <span className="flex w-full min-w-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex shrink-0" data-testid={`anomaly-icon-${row.anomalyKey}`}>
                <Icon className="size-4" aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent>{card.ruleTooltip}</TooltipContent>
          </Tooltip>
          <span
            className={cn('min-w-0 truncate text-sm', toHandle ? 'font-semibold' : 'font-medium')}
            title={headline}
            data-testid={`anomaly-headline-${row.anomalyKey}`}
          >
            {headline}
          </span>
          {card.excess && (
            // Shrinks (and truncates) before the headline when the line is short of space.
            <span
              className="min-w-0 shrink-100 truncate text-xs font-medium tabular-nums"
              title={card.excess}
              data-testid={`anomaly-excess-${row.anomalyKey}`}
            >
              {card.excess}
            </span>
          )}
          <StatusPill status={row.status} className="ml-auto shrink-0" data-testid={`anomaly-status-${row.anomalyKey}`} />
        </span>
        {details && (
          <span
            className="w-full truncate pl-5.5 text-xs text-muted-foreground"
            title={details}
            data-testid={`anomaly-details-${row.anomalyKey}`}
          >
            {details}
          </span>
        )}
        {card.time && (
          <span className="flex w-full min-w-0 pl-5.5 text-xs text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate" data-testid={`anomaly-time-${row.anomalyKey}`}>
                  {card.time.relative} · {card.time.absolute}
                </span>
              </TooltipTrigger>
              <TooltipContent>{card.time.iso}</TooltipContent>
            </Tooltip>
          </span>
        )}
      </Button>
    </li>
  )
}

/**
 * KAN-261 (FR4, FR5, FR8) + owner redesign 2026-11-25: anomalies as compact cards (up to three lines,
 * only the fields the list returns), each stating its status in a pill. Rows are shown in the given
 * order (the host sorts and filters). With `onSelect`, a click (or Enter) is reported as a selection
 * — the host locates its pallet on the map and opens the detail (Pulse, owner 2026-11-25: no
 * intermediate "Voir le détail" step); without it, a click opens the detail. `showName` false (pallet panel) drops the chip ID from the cards.
 */
export function AnomalyList({
  rows,
  showName = true,
  selectedKey,
  onSelect,
  onHover,
  onOpen,
}: {
  rows: AnomalyRow[]
  showName?: boolean
  selectedKey?: string | null
  onSelect?: (row: AnomalySelection) => void
  onHover?: (chipId: string | null) => void
  onOpen: (anomalyKey: string) => void
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-2" data-testid="anomaly-list">
      {rows.map((row) => (
        <AnomalyCard
          key={row.anomalyKey}
          row={row}
          showName={showName}
          selected={selectedKey === row.anomalyKey}
          onSelect={onSelect}
          onHover={onHover}
          onOpen={onOpen}
        />
      ))}
    </ul>
  )
}
