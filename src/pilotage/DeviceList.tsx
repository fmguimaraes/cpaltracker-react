import { useMemo, useState, type ComponentProps } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { PackageOpenIcon } from 'lucide-react'
import type { Position } from '../api/positions'
import { Button } from '@/ui/button'
import { DataTable, type DataTableColumn } from '@/ui/data-table'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/ui/empty'
import { cn } from '@/lib/utils'
import { StatusDot, type DeviceStatus } from '@/ui/status'
import { formatUtcInstant } from '../history/timelineData'

/**
 * KAN-159 (FR5, FR6) — renders the device list for an eligible, resolved
 * contract.
 *
 * FR6 (last-known calibration date): GAP7 (`cpal.docs/features/technical/
 * Device-Pilotage.md`) — `LASTCALIBRATION` is fetched by `pilotage.php` but
 * never exposed by any `/api/v1` endpoint today, so there is no calibration
 * field to show; per FR6's own decision ("shown only if the API exposes
 * it... the column is simply omitted"), this component omits it entirely
 * rather than fabricate one. The "last known reading" shown below is the
 * device's latest position *timestamp* (`GET /devices/positions.php`,
 * KAN-121) — explicitly labeled as that, never presented as a calibration
 * date.
 *
 * KAN-163 addition: `onSelect`/`selectedChipId` are optional so KAN-159's
 * own behavior and tests (plain, non-interactive rows) are unchanged when a
 * caller doesn't pass them. `PilotageWorkspace` passes both so the operator
 * can pick which device's settings form (KAN-163's `SettingsForm`) to show
 * (FR7).
 *
 * KAN-227 (FR10, F-33, F-36): rendered as the reference's PAT-LIST `DataTable`
 * (status dot first, mono id, last-seen with its absolute UTC time in `title`,
 * kit virtualization above `VIRTUALIZE_THRESHOLD`, the row testid and the
 * selection accent through `rowProps`, the list testid through
 * `containerProps`) and, below `md`, as the reference `MobileList` (one card
 * per device, a count and "Afficher plus"). Exactly one variant is rendered
 * (`useIsMobile`), so every testid sits on an element that is actually
 * displayed at the current width. Devices carry no health state in the API,
 * so the dot only says whether a position is known (offline grey when none).
 * Pagination is replaced by one scrolling list through the kit's
 * virtualization, which supersedes the former `@tanstack/react-virtual`
 * windowing below.
 *
 * KAN-173 (NFR5) addition: "device and history lists SHALL remain
 * responsive for a contract's full device set (virtualize if large)" —
 * beyond `VIRTUALIZE_THRESHOLD` rows are windowed with
 * `@tanstack/react-virtual`, the same package and threshold
 * `DeviceChecklist.tsx` (KAN-175, NFR3) already established for the
 * analogous history device list, rather than a second ad hoc convention.
 * Below the threshold (every contract this story has actually seen) rows
 * render directly, so this story's own and every prior KAN-159/163 test
 * keeps asserting the exact same markup.
 */
type SelectProps = { selectedChipId?: string; onSelect?: (chipId: string) => void }

function lastSeenLabel(device: Position) {
  return `Dernière position connue : ${device.timestamp}`
}

/** Absolute last-seen time for the `title`: UTC, as the monolith (`AAAA-MM-JJ HH:MM:SS UTC`). */
function lastSeenTitle(timestamp: string) {
  const ms = Date.parse(timestamp)
  return Number.isNaN(ms) ? timestamp : formatUtcInstant(ms)
}

function SelectButton({ device, selectedChipId, onSelect }: SelectProps & { device: Position }) {
  if (!onSelect) return <span className="font-mono">{device.chipId}</span>
  return (
    <Button
      variant="link"
      data-testid={`pilotage-device-${device.chipId}-select`}
      aria-pressed={selectedChipId === device.chipId}
      onClick={() => onSelect(device.chipId)}
      className="h-auto p-0 font-mono"
    >
      {device.chipId}
    </Button>
  )
}

function LastSeen({ device, className }: { device: Position; className?: string }) {
  if (!device.timestamp) return null
  return (
    <span
      data-testid={`pilotage-device-${device.chipId}-last-seen`}
      title={lastSeenTitle(device.timestamp)}
      className={cn('text-muted-foreground', className)}
    >
      {lastSeenLabel(device)}
    </span>
  )
}

function buildColumns(select: SelectProps): DataTableColumn<Position>[] {
  return [
    { id: 'status', header: 'Statut', enableSorting: false, cell: ({ row }) => <DeviceStatusDot device={row.original} /> },
    {
      id: 'chipId',
      accessorKey: 'chipId',
      header: 'Device',
      meta: { mono: true },
      cell: ({ row }) => <SelectButton device={row.original} {...select} />,
    },
    {
      id: 'lastSeen',
      accessorFn: (d) => d.timestamp ?? '',
      header: 'Dernière position',
      cell: ({ row }) =>
        row.original.timestamp ? (
          <LastSeen device={row.original} className="whitespace-nowrap" />
        ) : (
          <span aria-hidden className="text-muted-foreground">
            —
          </span>
        ),
    },
  ]
}

/** Cards shown at once below `md`, then "Afficher plus" (reference `devices/MobileList.tsx`). */
const MOBILE_PAGE = 20

function MobileList({ devices, ...select }: SelectProps & { devices: Position[] }) {
  const [shown, setShown] = useState(MOBILE_PAGE)
  const { selectedChipId, onSelect } = select
  return (
    <div className="flex flex-col gap-3">
      <ul data-testid="pilotage-device-list" aria-label="Devices" className="flex flex-col gap-2">
        {devices.slice(0, shown).map((device) => (
          <li
            key={device.chipId}
            data-testid={`pilotage-device-${device.chipId}`}
            className={cn(
              'flex flex-col gap-1 rounded-lg border border-border p-3',
              selectedChipId === device.chipId && onSelect ? 'bg-accent' : 'bg-card',
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <DeviceStatusDot device={device} />
              <SelectButton device={device} {...select} />
            </div>
            <LastSeen device={device} className="text-xs" />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span aria-live="polite" className="tabular-nums">
          {Math.min(shown, devices.length)} sur {devices.length}
        </span>
        {shown < devices.length && (
          <Button variant="outline" size="sm" onClick={() => setShown((n) => n + MOBILE_PAGE)}>
            Afficher plus
          </Button>
        )}
      </div>
    </div>
  )
}

function DesktopDeviceList({ devices, selectedChipId, onSelect }: SelectProps & { devices: Position[] }) {
  const columns = useMemo(() => buildColumns({ selectedChipId, onSelect }), [selectedChipId, onSelect])
  return (
    <div data-testid={devices.length > VIRTUALIZE_THRESHOLD ? 'pilotage-device-list-scroll' : undefined}>
      <DataTable<Position>
        label="Devices"
        columns={columns}
        data={devices}
        getRowId={(d) => d.chipId}
        pageSize={VIRTUALIZE_THRESHOLD}
        virtualizeThreshold={VIRTUALIZE_THRESHOLD}
        emptyMessage="Aucun device trouvé pour ce contrat."
        containerProps={{ 'data-testid': 'pilotage-device-list' } as ComponentProps<'div'>}
        rowProps={(device) => {
          const selected = Boolean(onSelect) && selectedChipId === device.chipId
          return {
            'data-testid': `pilotage-device-${device.chipId}`,
            'aria-selected': onSelect ? selected : undefined,
            className: selected ? 'bg-accent font-medium hover:bg-accent' : 'bg-card',
          } as ComponentProps<'tr'>
        }}
      />
    </div>
  )
}

function EmptyDevices() {
  return (
    <Empty data-testid="pilotage-devices-empty">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <PackageOpenIcon aria-hidden />
        </EmptyMedia>
        <EmptyDescription>Aucun device trouvé pour ce contrat.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function DeviceList({ devices, selectedChipId, onSelect }: SelectProps & { devices: Position[] }) {
  const isMobile = useIsMobile()
  if (devices.length === 0) return <EmptyDevices />
  const List = isMobile ? MobileList : DesktopDeviceList
  return (
    <div className="min-w-0">
      <List devices={devices} selectedChipId={selectedChipId} onSelect={onSelect} />
    </div>
  )
}

function DeviceStatusDot({ device }: { device: Position }) {
  const status: DeviceStatus = device.timestamp ? 'ok' : 'offline'
  return <StatusDot status={status} label={device.timestamp ? 'Position connue' : 'Aucune position'} />
}

const VIRTUALIZE_THRESHOLD = 50
