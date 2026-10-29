import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { FieldLegend, FieldSet } from '@/ui/field'
import { Label } from '@/ui/label'
import { StatusBadge, type DeviceStatus } from '@/ui/status'
import { STATE_LABEL } from './fleetModel'
import { useDeviceVisibilityStore } from './deviceVisibilityStore'

/**
 * KAN-162 (FR8) — one checkbox per currently-fetched device, plus a
 * "show all" reset. Purely a view over `useDeviceVisibilityStore` — no
 * network request is ever triggered by a change here. FR8 restyle: kit
 * `Checkbox` rows with the device state badge; `statuses` is optional so
 * the filter still works with ids alone.
 */
export function DeviceFilter({
  chipIds,
  statuses,
}: {
  chipIds: string[]
  statuses?: Record<string, DeviceStatus>
}) {
  const hiddenChipIds = useDeviceVisibilityStore((state) => state.hiddenChipIds)
  const toggleDevice = useDeviceVisibilityStore((state) => state.toggleDevice)
  const showAll = useDeviceVisibilityStore((state) => state.showAll)

  if (chipIds.length === 0) return null

  return (
    <FieldSet data-testid="device-filter" className="gap-2">
      <FieldLegend variant="label" className="mb-0">
        Appareils affichés
      </FieldLegend>
      <Button type="button" variant="outline" size="sm" onClick={showAll} data-testid="device-filter-show-all" className="self-start">
        Tout afficher
      </Button>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {chipIds.map((chipId) => {
          const status = statuses?.[chipId]
          return (
            <li key={chipId} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Checkbox
                  id={`device-filter-box-${chipId}`}
                  checked={!hiddenChipIds.has(chipId)}
                  onCheckedChange={() => toggleDevice(chipId)}
                  data-testid={`device-filter-${chipId}`}
                />
                <Label htmlFor={`device-filter-box-${chipId}`} className="truncate">
                  {chipId}
                </Label>
              </div>
              {status && <StatusBadge status={status} label={STATE_LABEL[status]} />}
            </li>
          )
        })}
      </ul>
    </FieldSet>
  )
}
