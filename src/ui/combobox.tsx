import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover"

type ComboboxOption = { value: string; label: string; disabled?: boolean }

type ComboboxProps = {
  options: ComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  className?: string
  "aria-invalid"?: boolean
  "aria-describedby"?: string
  "aria-label"?: string
}

/** Searchable single select: Popover + Command. Bordered trigger (border-input, 3:1). */
function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No result.",
  disabled,
  id,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-slot="combobox-trigger"
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
          {...aria}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDownIcon aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-56 gap-0 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.value} ${o.label}`}
                  disabled={o.disabled}
                  data-checked={o.value === value}
                  onSelect={() => {
                    onValueChange?.(o.value === value ? "" : o.value)
                    setOpen(false)
                  }}
                >
                  {o.label}
                  <CheckIcon aria-hidden="true" className={cn("ml-auto size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox }
export type { ComboboxOption, ComboboxProps }
