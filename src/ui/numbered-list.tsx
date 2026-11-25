import * as React from "react"
import { cn } from "@/lib/utils"

export interface NumberedItem {
  title: string
  description?: React.ReactNode
}

/** DAT-LIST (brand numbered list): big cyan Montserrat ExtraBold number, bold title, description, separators. */
function NumberedList({ items, className }: { items: NumberedItem[]; className?: string }) {
  return (
    <ol data-slot="numbered-list" className={cn("flex flex-col divide-y divide-border", className)}>
      {items.map((it, i) => (
        <li key={it.title} className="flex gap-4 py-4 first:pt-0 last:pb-0">
          <span aria-hidden className="w-10 shrink-0 font-display font-extrabold text-4xl leading-none text-primary-text tabular-nums">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-foreground">{it.title}</p>
            {it.description ? <p className="text-sm text-muted-foreground">{it.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

export { NumberedList }
