import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/ui/button"

/** Visible strings; defaults to English. */
interface MobileListLabels {
  /** "8 of 48" */
  count: (shown: number, total: number) => string
  /** Pager button below the cards (paged mode only). */
  showMore: string
}

const DEFAULT_LABELS: MobileListLabels = {
  count: (shown, total) => `${shown} of ${total}`,
  showMore: "Show more",
}

interface MobileListProps<T> {
  items: T[]
  getKey: (item: T) => string
  /** Card content, rendered inside the item's `<li>`. */
  renderItem: (item: T, index: number) => React.ReactNode
  /** Extra props for each `<li>` (className, data-testid, selection state …). */
  itemProps?: (item: T, index: number) => Omit<React.ComponentProps<"li">, "children" | "ref">
  /** Accessible name of the list. */
  label: string
  /** Extra props for the `<ul>` (data-testid …). */
  listProps?: Omit<React.ComponentProps<"ul">, "children" | "ref" | "aria-label">
  /** Cards per "Show more" step in paged mode. */
  pageSize?: number
  /** Controlled paged count (with `onShowMore`); otherwise the list pages itself by `pageSize`. */
  shown?: number
  onShowMore?: () => void
  /**
   * Windowing: above this many items only the cards around the scroll position are mounted, every
   * item is reachable by scrolling (no "Show more"), and the count shows the total. Default 100.
   */
  windowThreshold?: number
  /** Card height (px, gap excluded) assumed before a card is measured. */
  estimateItemPx?: number
  /** Cards mounted above and below the viewport. */
  overscan?: number
  labels?: Partial<MobileListLabels>
  className?: string
}

/** Matches `gap-2` between cards. */
const GAP_PX = 8

/**
 * PAT-LIST mobile: one card per item, a live count, then either "Show more" (paged) or, above
 * `windowThreshold`, windowing against the page scroll. Windowed cards are absolutely placed from
 * measured heights; the focused card stays mounted, so Tab and Shift+Tab walk the whole list.
 */
function MobileList<T>({
  items,
  windowThreshold = 100,
  ...props
}: MobileListProps<T>) {
  return items.length > windowThreshold ? <WindowedList items={items} {...props} /> : <PagedList items={items} {...props} />
}

type InnerProps<T> = Omit<MobileListProps<T>, "windowThreshold">

function PagedList<T>({ items, getKey, renderItem, itemProps, label, listProps, pageSize = 10, shown: shownProp, onShowMore, labels }: InnerProps<T>) {
  const L = { ...DEFAULT_LABELS, ...labels }
  const [own, setOwn] = React.useState(pageSize)
  const shown = shownProp ?? own
  const more = onShowMore ?? (() => setOwn((s) => s + pageSize))
  return (
    <>
      <ul {...listProps} data-slot="mobile-list" aria-label={label} className={cn("flex flex-col gap-2", listProps?.className)}>
        {items.slice(0, shown).map((item, i) => (
          <li key={getKey(item)} {...itemProps?.(item, i)}>
            {renderItem(item, i)}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span aria-live="polite">{L.count(Math.min(shown, items.length), items.length)}</span>
        {shown < items.length && (
          <Button variant="outline" size="sm" onClick={more}>
            {L.showMore}
          </Button>
        )}
      </div>
    </>
  )
}

/** First index whose bottom edge is below `y` (offsets ascending). */
function indexAt(offsets: number[], heights: number[], y: number) {
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] + heights[mid] < y) lo = mid + 1
    else hi = mid
  }
  return lo
}

function WindowedList<T>({ items, getKey, renderItem, itemProps, label, listProps, estimateItemPx = 160, overscan = 4, labels }: InnerProps<T>) {
  const L = { ...DEFAULT_LABELS, ...labels }
  const listRef = React.useRef<HTMLUListElement>(null)
  const sizes = React.useRef(new Map<string, number>())
  const [measured, setMeasured] = React.useState(0)
  const [view, setView] = React.useState({ top: 0, bottom: 1000 })
  const [focusKey, setFocusKey] = React.useState<string | null>(null)

  const keys = React.useMemo(() => items.map(getKey), [items, getKey])
  const { offsets, heights, total } = React.useMemo(() => {
    const h = keys.map((k) => sizes.current.get(k) ?? estimateItemPx)
    const o = new Array<number>(h.length)
    let y = 0
    for (let i = 0; i < h.length; i++) {
      o[i] = y
      y += h[i] + GAP_PX
    }
    return { offsets: o, heights: h, total: Math.max(0, y - GAP_PX) }
    // `measured` bumps when a card's height changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, estimateItemPx, measured])

  // Visible span of the list in its own coordinates, whichever ancestor scrolls.
  React.useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const r = el.getBoundingClientRect()
      const top = Math.max(0, -r.top)
      const bottom = Math.max(top, window.innerHeight - r.top)
      setView((v) => (v.top === top && v.bottom === bottom ? v : { top, bottom }))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      document.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const observer = React.useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            let changed = false
            for (const e of entries) {
              const key = (e.target as HTMLElement).dataset.key
              const px = Math.round(e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight)
              if (key !== undefined && px > 0 && sizes.current.get(key) !== px) {
                sizes.current.set(key, px)
                changed = true
              }
            }
            if (changed) setMeasured((m) => m + 1)
          }),
    [],
  )
  React.useEffect(() => () => observer?.disconnect(), [observer])
  const measure = React.useCallback(
    (node: HTMLLIElement | null) => {
      if (!node || !observer) return
      observer.observe(node)
      return () => observer.unobserve(node)
    },
    [observer],
  )

  const n = items.length
  const first = n ? Math.max(0, indexAt(offsets, heights, view.top) - overscan) : 0
  const last = n ? Math.min(n - 1, indexAt(offsets, heights, view.bottom) + overscan) : -1
  // The focused card and its neighbours stay mounted wherever the page scrolls, so Tab and
  // Shift+Tab always have the next card to land on.
  const focusIndex = focusKey === null ? -1 : keys.indexOf(focusKey)
  const near = focusIndex < 0 ? [] : [focusIndex - 1, focusIndex, focusIndex + 1].filter((i) => i >= 0 && i < n)
  const mounted = [...near.filter((i) => i < first)]
  for (let i = first; i <= last; i++) mounted.push(i)
  mounted.push(...near.filter((i) => i > last))

  return (
    <>
      <ul
        {...listProps}
        ref={listRef}
        data-slot="mobile-list"
        data-windowed="true"
        aria-label={label}
        className={cn("relative", listProps?.className)}
        // Dynamic geometry: cannot be a token utility
        style={{ ...listProps?.style, height: total }}
        onFocus={(e) => {
          listProps?.onFocus?.(e)
          const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-key]")
          if (li?.dataset.key !== undefined) setFocusKey(li.dataset.key)
        }}
        onBlur={(e) => {
          listProps?.onBlur?.(e)
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusKey(null)
        }}
      >
        {mounted.map((i) => {
          const item = items[i]
          const extra = itemProps?.(item, i)
          return (
            <li
              key={keys[i]}
              {...extra}
              ref={measure}
              data-key={keys[i]}
              aria-setsize={n}
              aria-posinset={i + 1}
              className={cn("absolute inset-x-0", extra?.className)}
              // Dynamic geometry: cannot be a token utility
              style={{ ...extra?.style, top: offsets[i] }}
            >
              {renderItem(item, i)}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span aria-live="polite">{L.count(n, n)}</span>
      </div>
    </>
  )
}

export { MobileList, type MobileListProps, type MobileListLabels }
