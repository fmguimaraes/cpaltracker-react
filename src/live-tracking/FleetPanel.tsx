import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/ui/button'
import { Card } from '@/ui/card'
import { DonutChart } from '@/ui/charts'
import { Stat } from '@/ui/stat'
import { countByStatus, type DeviceStatus } from '@/ui/status'
import { cn } from '@/lib/utils'
import { STATE_LABEL, STATES } from './fleetModel'

const SLICE_COLOR = { ok: 'success', warning: 'warning', alert: 'danger', offline: 4 } as const

/**
 * FR8 — the PAT-SPLIT fleet panel (`ref:live/FleetPanel.tsx`): state donut,
 * the two key numbers and the device list (children) that filters the map.
 * Overlays the map on desktop (collapsible), sits below it at 390 px.
 * `statuses` is the whole fleet (unfiltered) so the numbers never move when
 * a device is hidden from the map.
 */
export function FleetPanel({ statuses, children }: { statuses: DeviceStatus[]; children?: ReactNode }) {
  const bodyId = useId()
  const [open, setOpen] = useState(true)
  const counts = countByStatus(statuses.map((status) => ({ status })))
  const total = statuses.length
  const inRange = total === 0 ? 0 : Math.round((counts.ok / total) * 100)
  const toHandle = counts.alert + counts.warning + counts.offline

  return (
    <Card
      role="complementary"
      aria-label="Panneau de flotte"
      data-testid="fleet-panel"
      size="sm"
      className="z-1000 gap-0 py-0 shadow-overlay md:absolute md:top-3 md:bottom-3 md:left-3 md:w-80"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Flotte</h2>
          <p className="text-xs text-muted-foreground">
            {total} appareils · {toHandle} à traiter
          </p>
        </div>
        <Button
          variant="secondary"
          size="icon-sm"
          className="max-md:hidden"
          aria-label={open ? 'Réduire le panneau de flotte' : 'Ouvrir le panneau de flotte'}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
      </div>
      <div id={bodyId} className={cn('min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4', open ? 'flex' : 'max-md:flex md:hidden')}>
        <section aria-label="Répartition par état">
          <DonutChart
            className="h-56 w-full"
            label={`Répartition des ${total} appareils par état`}
            centerLabel={`${inRange}%`}
            slices={STATES.map((s) => ({ label: `${STATE_LABEL[s]} · ${counts[s]}`, value: counts[s], color: SLICE_COLOR[s] }))}
          />
        </section>
        <div className="grid grid-cols-2 gap-3 border-y border-border py-3">
          <Stat label="Dans la plage" value={inRange} unit="%" accent />
          <Stat label="À traiter" value={toHandle} />
        </div>
        {children}
      </div>
    </Card>
  )
}
