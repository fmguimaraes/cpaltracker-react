import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * DAT-STAT: Montserrat ExtraBold big number, unit, label, trend arrow + % vs previous.
 * `goodDirection` says which way is good (fewer excursions = "down"), so the trend is colored by
 * outcome, not by sign. Direction is also carried by the arrow and the screen-reader text.
 */
function Stat({
  label,
  value,
  unit,
  change,
  goodDirection = "up",
  comparison = "vs previous period",
  accent = false,
  className,
  hideLabel = false,
  valueClassName,
}: {
  label: string
  /** null = no reading: renders "—" (never 0). */
  value: number | string | null
  unit?: string
  /** Percent change vs previous, e.g. -36.4. */
  change?: number | null
  goodDirection?: "up" | "down"
  comparison?: string
  /** Cyan key number (use for the one key figure of a view). */
  accent?: boolean
  className?: string
  /** Hide the visible label text while keeping it available to assistive tech via aria-label. */
  hideLabel?: boolean
  /** Override the value's text size, e.g. for a longer value string that needs to shrink slightly. */
  valueClassName?: string
}) {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change)
  const dir = !hasChange || change === 0 ? "flat" : change > 0 ? "up" : "down"
  const tone = dir === "flat" ? "text-muted-foreground" : dir === goodDirection ? "text-success" : "text-danger"
  const Arrow = dir === "up" ? ArrowUpIcon : dir === "down" ? ArrowDownIcon : MinusIcon
  const pct = hasChange ? `${Math.abs(change).toFixed(1)}%` : ""
  return (
    <div
      data-slot="stat"
      aria-label={hideLabel ? label : undefined}
      className={cn("flex min-w-0 flex-col gap-1", className)}
    >
      {!hideLabel && <p className="truncate text-sm text-muted-foreground">{label}</p>}
      <span
        className={cn(
          "font-display font-extrabold text-4xl leading-none tabular-nums",
          accent ? "text-primary-text" : "text-foreground",
          valueClassName,
        )}
      >
        {value ?? "—"}
      </span>
      {unit && value !== null ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      {hasChange ? (
        <p className={cn("flex items-center gap-1 text-xs", tone)}>
          <Arrow aria-hidden className="size-3.5" />
          <span className="font-medium tabular-nums">
            <span className="sr-only">{dir === "flat" ? "Unchanged " : `${dir === "up" ? "Up" : "Down"}, ${dir === goodDirection ? "better" : "worse"} `}</span>
            {pct}
          </span>
          <span className="text-muted-foreground">{comparison}</span>
        </p>
      ) : null}
    </div>
  )
}

export { Stat }
