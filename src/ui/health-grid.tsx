import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip"
import { countByStatus, statusIcon, statusLabel, statusTone, type DeviceStatus, type StatusDevice } from "@/ui/status"

const ORDER: DeviceStatus[] = ["alert", "warning", "offline", "ok"]

/** DAT-HEALTHGRID: one glyph per device, colored by state (icon shape also differs), tooltip id + name, legend with counts. */
function HealthGrid<D extends StatusDevice = StatusDevice>({
  devices,
  onSelect,
  labels = statusLabel,
  className,
}: {
  devices: D[]
  onSelect?: (device: D) => void
  /** Per-state labels (default English), for pages that keep another language. */
  labels?: Record<DeviceStatus, string>
  className?: string
}) {
  const counts = countByStatus(devices)
  return (
    <div data-slot="health-grid" className={cn("flex flex-col gap-3", className)}>
      <ul className="flex flex-wrap gap-1" aria-label="Devices by state">
        {devices.map((d) => {
          const Icon = statusIcon[d.status]
          return (
            <li key={d.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${d.id}, ${d.name}, ${labels[d.status]}`}
                    onClick={() => onSelect?.(d)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      statusTone[d.status].text,
                    )}
                  >
                    <Icon aria-hidden className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="font-mono">{d.id}</span> · {d.name}
                </TooltipContent>
              </Tooltip>
            </li>
          )
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Legend">
        {ORDER.map((s) => {
          const Icon = statusIcon[s]
          return (
            <li key={s} className="inline-flex items-center gap-1.5">
              <Icon aria-hidden className={cn("size-4", statusTone[s].text)} />
              <span className="text-foreground">{labels[s]}</span>
              <span className="text-muted-foreground tabular-nums">{counts[s]}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export { HealthGrid }
