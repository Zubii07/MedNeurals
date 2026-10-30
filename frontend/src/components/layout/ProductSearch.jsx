import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command as CommandPrimitive } from 'cmdk'
import { ArrowRight, Loader2, Package, Search } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useProductSearch } from '@/api/hooks'
import { errorMessage } from '@/api/client'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 300

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * Header product search with typeahead (plan §4): GET /products?search=…&limit=8, debounced 300 ms.
 * Selecting a product opens Product Analysis; "See all results" opens the Products list.
 * ⌘K / Ctrl+K focuses the box.
 */
export default function ProductSearch({ className }) {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const term = useDebounced(value.trim(), DEBOUNCE_MS)
  const { data, isFetching, isError, error } = useProductSearch(term)

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const showList = open && value.trim().length > 0
  const waiting = term !== value.trim() || (isFetching && !data)

  const goTo = (path) => {
    setOpen(false)
    setValue('')
    inputRef.current?.blur()
    navigate(path)
  }

  const seeAllPath = `/products?search=${encodeURIComponent(value.trim())}`

  return (
    <Command shouldFilter={false} loop className={cn('relative overflow-visible rounded-xl bg-transparent p-0', className)}>
      <Popover open={showList} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={value}
              onValueChange={(next) => {
                setValue(next)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setOpen(false)
                  event.currentTarget.blur()
                }
              }}
              type="search"
              role="combobox"
              aria-expanded={showList}
              aria-label="Search products"
              placeholder="Search products by name or id…"
              autoComplete="off"
              className="h-11 w-full min-w-0 rounded-xl border border-border bg-card pr-4 pl-10 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:pr-14 [&::-webkit-search-cancel-button]:appearance-none"
            />
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:inline-flex"
            >
              ⌘K
            </kbd>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (inputRef.current && event.target instanceof Node && inputRef.current.contains(event.target)) event.preventDefault()
          }}
          className="w-(--radix-popover-trigger-width) min-w-[18rem] rounded-xl p-1 shadow-lg ring-border"
        >
          <CommandList className="max-h-80">
            {waiting ? (
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
                      <CommandItem
                        key={product.item_id}
                        value={product.item_id}
                        onSelect={() => goTo(`/products/${product.item_id}`)}
                        className="gap-3 rounded-lg px-2 py-2"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                          <Package className="size-4" aria-hidden="true" />
                        </span>
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
                {items.length > 0 ? (
                  <CommandGroup className="border-t border-border/70 pt-1">
                    <CommandItem value="__see_all__" onSelect={() => goTo(seeAllPath)} className="justify-center gap-1 rounded-lg text-sm font-medium text-primary">
                      See all {total.toLocaleString()} results
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </CommandItem>
                  </CommandGroup>
                ) : null}
              </>
            )}
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
  )
}
