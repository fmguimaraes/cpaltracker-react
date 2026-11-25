import { cn } from '@/lib/utils'

/**
 * Brand mark of the collapsed sidebar rail: a cyan dot in a soft cyan halo (the charter's map-marker
 * motif). Shown only when the sidebar is collapsed to icons, where the wordmark is hidden (no square logo
 * exists). Colors come from tokens, so it follows the theme: --brand (the logo cyan) for the dot, a 20 % --brand
 * halo over the sidebar surface. Decorative: the header link or wordmark carries the name.
 */
export function RailMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      data-slot="rail-mark"
      className={cn(
        'hidden size-6 shrink-0 items-center justify-center rounded-full bg-brand/20 group-data-[collapsible=icon]:flex',
        className,
      )}
      {...props}
    >
      <span className="size-3 rounded-full bg-brand" />
    </span>
  )
}
