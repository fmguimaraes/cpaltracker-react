import * as React from "react"
import { CircleAlertIcon, CircleCheckIcon, CircleOffIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/ui/badge"

/** Device state. Kit-owned: apps map their own data to it (mock/API types satisfy it structurally). */
export type DeviceStatus = "ok" | "warning" | "alert" | "offline"

/** Default English labels; pass `label` to the components to localise per page. */
export const statusLabel: Record<DeviceStatus, string> = {
  ok: "OK",
  warning: "Warning",
  alert: "Alert",
  offline: "Not reporting",
}

/** Minimal device shape the kit needs (HealthGrid). Extra fields are allowed and passed back to callbacks. */
export interface StatusDevice {
  id: string
  name: string
  status: DeviceStatus
}

/** Count devices per state (all four keys always present). */
export function countByStatus(list: ReadonlyArray<{ status: DeviceStatus }>): Record<DeviceStatus, number> {
  const counts: Record<DeviceStatus, number> = { ok: 0, warning: 0, alert: 0, offline: 0 }
  for (const d of list) counts[d.status]++
  return counts
}

/** D3: ok = success, warning = yellow (never orange), alert = danger, offline = grey. */
export const statusTone: Record<DeviceStatus, { dot: string; text: string; badge: "success" | "warning" | "danger" | "offline" }> = {
  ok: { dot: "bg-success", text: "text-success", badge: "success" },
  warning: { dot: "bg-warning", text: "text-warning", badge: "warning" },
  alert: { dot: "bg-danger", text: "text-danger", badge: "danger" },
  offline: { dot: "bg-offline", text: "text-offline", badge: "offline" },
}

/** Shape redundancy so the state never relies on color alone. */
export const statusIcon = {
  ok: CircleCheckIcon,
  warning: TriangleAlertIcon,
  alert: CircleAlertIcon,
  offline: CircleOffIcon,
} satisfies Record<DeviceStatus, React.ComponentType<React.ComponentProps<"svg">>>

/** DAT-STATUS: dot + label. The label is always in the DOM (visually hidden when `showLabel` is false). */
function StatusDot({
  status,
  showLabel = true,
  label,
  className,
}: {
  status: DeviceStatus
  showLabel?: boolean
  label?: string
  className?: string
}) {
  const text = label ?? statusLabel[status]
  return (
    <span data-slot="status-dot" data-status={status} className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", statusTone[status].dot)} />
      <span className={showLabel ? "text-foreground" : "sr-only"}>{text}</span>
    </span>
  )
}

/** Soft-fill badge with icon + label for a DeviceStatus. */
function StatusBadge({
  status,
  label,
  className,
}: {
  status: DeviceStatus
  label?: string
  className?: string
}) {
  const Icon = statusIcon[status]
  return (
    <Badge variant={statusTone[status].badge} data-status={status} className={className}>
      <Icon aria-hidden />
      {label ?? statusLabel[status]}
    </Badge>
  )
}

export { StatusDot, StatusBadge }
