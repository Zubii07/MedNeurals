import { useState } from 'react'
import { ChevronsUpDown, Loader2, Package, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProductSearch } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { useDebounced } from '@/hooks/use-debounced'
import { cn } from '@/lib/utils'

/**
 * Item picker for list filters (plan §7.2, §7.3, §7.5): a combobox over GET /products?search=…&limit=8.
 * Controlled by `value` (the `item_id` kept in the URL). The button shows `label` when the page knows the
 * item name (from its rows), otherwise the name picked here, otherwise the id itself.
 *
 * @param {{ id?: string, value: string, label?: string, onChange: (itemId: string) => void, placeholder?: string, className?: string }} props
 */
export default function ProductPicker({ id, value, label, onChange, placeholder = 'All items', className }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  const term = useDebounced(search.trim(), 300)
  const { data, isFetching, isError, error } = useProductSearch(term, { enabled: open && term.length > 0 })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const waiting = term !== search.trim() || (isFetching && !data)
  const display = value ? (label ?? (picked?.item_id === value ? picked.item_name : value)) : ''

  const select = (product) => {
    setPicked(product)
    setOpen(false)
    setSearch('')
    onChange(product.item_id)
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setSearch('')
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 min-w-0 flex-1 justify-between bg-card px-3 font-normal"
          >
            <span className={cn('flex min-w-0 items-center gap-2', !display && 'text-muted-foreground')}>
              <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{display || placeholder}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-(--radix-popover-trigger-width) min-w-[18rem] rounded-xl p-0 shadow-lg">
          <Command shouldFilter={false} loop>
            <CommandInput value={search} onValueChange={setSearch} placeholder="Search by name or item id…" />
            <CommandList className="max-h-72">
              {term.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">Type to search the item master.</div>
              ) : waiting ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Searching…
                </div>
              ) : isError ? (
                <div className="px-3 py-4 text-sm text-danger">{errorMessage(error)}</div>
              ) : (
                <>
                  <CommandEmpty>No products match “{term}”.</CommandEmpty>
                  {items.length > 0 ? (
                    <CommandGroup heading={`Products · ${total.toLocaleString()} match${total === 1 ? '' : 'es'}`}>
                      {items.map((product) => (
                        <CommandItem key={product.item_id} value={product.item_id} onSelect={() => select(product)} className="gap-3 rounded-lg px-2 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">{product.item_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {product.item_id} · {product.category_name}
                              {product.uom ? ` · ${product.uom}` : ''}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button type="button" variant="ghost" size="icon-lg" aria-label="Clear item" className="shrink-0 text-muted-foreground" onClick={() => onChange('')}>
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
