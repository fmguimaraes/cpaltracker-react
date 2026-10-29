import type * as React from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { statusTone, type DeviceStatus } from "@/ui/status"

export interface TimelineItem {
  id: string
  /** Display date for the brand timeline (e.g. "2026"), shown in Georgia above the dot. */
  date: string
  label: string
}

/** DAT-TIMELINE (brand): grey line, orange dots, Georgia date above, label below. Scrolls sideways on mobile. */
function Timeline({ items, className, label }: { items: TimelineItem[]; className?: string; label?: string }) {
  return (
    <div data-slot="timeline" className={cn("overflow-x-auto pb-1", className)}>
      <ol aria-label={label} className="flex min-w-max">
        {items.map((it) => (
          <li key={it.id} className="relative flex w-40 flex-col gap-2 pr-3">
            <span className="font-serif text-xl text-foreground">{it.date}</span>
            <span className="relative flex h-3 items-center">
              <span aria-hidden className="absolute inset-x-0 h-px bg-border" />
              <span aria-hidden className="relative size-3 rounded-full bg-primary" />
            </span>
            <span className="text-sm text-muted-foreground">{it.label}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export interface ActivityItem {
  id: string
  at: string // ISO
  title: string
  detail?: string
  /** Colors the dot with a device state; omit for a neutral dot. */
  status?: DeviceStatus
  /** Shown after the title (e.g. a `Badge` for an ongoing entry). */
  badge?: React.ReactNode
  /** Rendered as data-testid on the item, for the caller's own tests. */
  testId?: string
}

/** DAT-TIMELINE (activity): vertical, newest first as given. The title carries the meaning, the dot is decoration. */
function ActivityTimeline({
  items,
  className,
  label,
  formatTime,
}: {
  items: ActivityItem[]
  className?: string
  label?: string
  /** Formats each timestamp for display. Default "d MMM, HH:mm" (English). */
  formatTime?: (at: Date) => string
}) {
  return (
    <ol data-slot="activity-timeline" aria-label={label} className={cn("flex flex-col", className)}>
      {items.map((it, i) => (
        <li key={it.id} data-testid={it.testId} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 ? <span aria-hidden className="absolute top-3 bottom-0 left-[5px] w-px bg-border" /> : null}
          <span
            aria-hidden
            className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-card", it.status ? statusTone[it.status].dot : "bg-offline")}
          />
          <div className="min-w-0">
            {it.badge ? (
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                {it.title}
                {it.badge}
              </p>
            ) : (
              <p className="text-sm font-medium text-foreground">{it.title}</p>
            )}
            {it.detail ? <p className="truncate text-sm text-muted-foreground">{it.detail}</p> : null}
            <time dateTime={it.at} className="text-xs text-muted-foreground tabular-nums">
              {(formatTime ?? ((d) => format(d, "d MMM, HH:mm")))(new Date(it.at))}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}

export { Timeline, ActivityTimeline }
