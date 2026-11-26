import { cn } from "@/lib/utils"

/**
 * `surface="card"` for a skeleton drawn on a card, the sidebar or the segmented track: those surfaces are the
 * same colour as `--muted` (tokens.css), so the default fill would be invisible there. The `--border` token
 * contrasts with them in both themes.
 */
function Skeleton({
  className,
  surface = "page",
  ...props
}: React.ComponentProps<"div"> & { surface?: "page" | "card" }) {
  return (
    <div
      data-slot="skeleton"
      data-surface={surface}
      className={cn("animate-pulse rounded-md", surface === "card" ? "bg-border" : "bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
