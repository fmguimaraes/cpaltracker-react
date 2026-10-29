import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'

export interface FilterChip {
  id: string
  attribute: string
  value: string
}

export interface FilterBarProps {
  /** Active filters, rendered as removable `attribute = value` chips. */
  filters: FilterChip[]
  onRemove: (id: string) => void
  /** Called with the new filter from the "Add filter" popover; the page assigns the id. */
  onAdd: (filter: { attribute: string; value: string }) => void
  /** Filterable attributes offered in the add popover. */
  attributes: string[]
  className?: string
}

/** Filter bar: removable `attribute = value` chips plus an "Add filter" popover. */
export function FilterBar({ filters, onRemove, onAdd, attributes, className }: FilterBarProps) {
  const [open, setOpen] = useState(false)
  const [attribute, setAttribute] = useState(attributes[0] ?? '')
  const [value, setValue] = useState('')

  return (
    <div className={className ? `flex flex-wrap items-center gap-2 ${className}` : 'flex flex-wrap items-center gap-2'} data-testid="filter-bar">
      {filters.map((filter) => (
        <Badge key={filter.id} variant="outline" className="h-7 gap-1 pr-1 text-sm font-normal" data-testid="filter-chip">
          <span>
            {filter.attribute} = <span className="font-medium">{filter.value}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Retirer le filtre ${filter.attribute} = ${filter.value}`}
            onClick={() => onRemove(filter.id)}
          >
            <X />
          </Button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" data-testid="filter-add">
            <Plus />
            Ajouter un filtre
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const trimmed = value.trim()
              if (!attribute || !trimmed) return
              onAdd({ attribute, value: trimmed })
              setValue('')
              setOpen(false)
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-attribute">Attribut</Label>
              <NativeSelect id="filter-attribute" value={attribute} onChange={(e) => setAttribute(e.target.value)}>
                {attributes.map((name) => (
                  <NativeSelectOption key={name} value={name}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="filter-value">Valeur</Label>
              <Input id="filter-value" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <Button type="submit" size="sm" disabled={!value.trim()}>
              Ajouter
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
