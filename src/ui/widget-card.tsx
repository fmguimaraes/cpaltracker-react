import * as React from "react"
import { MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/ui/empty"

export interface WidgetMenuItem {
  label: string
  onSelect?: () => void
}

/** DAT-WIDGET: title, period subtitle, ⋯ menu, and an empty state rendered inside the card. */
function WidgetCard({
  title,
  period,
  menu,
  menuLabel,
  empty,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Card>, "title"> & {
  title: string
  period?: string
  menu?: WidgetMenuItem[]
  /** Accessible name of the ⋯ button; defaults to "<title> options". */
  menuLabel?: string
  /** When set, the empty state replaces `children`. */
  empty?: { title: string; description?: string }
}) {
  return (
    <Card size="sm" className={className} {...props}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {period ? <CardDescription>{period}</CardDescription> : null}
        {menu?.length ? (
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={menuLabel ?? `${title} options`}>
                  <MoreHorizontalIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menu.map((m) => (
                  <DropdownMenuItem key={m.label} onSelect={() => m.onSelect?.()}>
                    {m.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <Empty className="border-0 p-4">
            <EmptyHeader>
              <EmptyTitle>{empty.title}</EmptyTitle>
              {empty.description ? <EmptyDescription>{empty.description}</EmptyDescription> : null}
            </EmptyHeader>
          </Empty>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

export { WidgetCard }
