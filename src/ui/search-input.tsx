import * as React from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/ui/input-group"

type SearchInputProps = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name; the field has no visible label. */
  label?: string
}

/** Bordered search field: leading icon, clear button when filled, Escape clears. */
function SearchInput({ value, onValueChange, label = "Search", className, placeholder = "Search…", onKeyDown, ...props }: SearchInputProps) {
  return (
    <InputGroup className={cn("max-w-sm", className)} data-slot="search-input">
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        {...props}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          if (e.defaultPrevented) return
          if (e.key === "Escape" && value) {
            e.preventDefault()
            onValueChange("")
          }
        }}
        className="[&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => onValueChange("")}>
            <XIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}

export { SearchInput }
