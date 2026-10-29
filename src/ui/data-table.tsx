import * as React from "react"
import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type CellData,
  type ColumnDef,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type TableFeatures,
} from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/ui/button"
import { Checkbox } from "@/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip"

/** TanStack Table v9: tree-shakeable features, declared once at module scope (stable reference). */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
})
type DataTableFeatures = typeof features

/** Column definition for DataTable<T>. */
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T, any> // eslint-disable-line @typescript-eslint/no-explicit-any

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<in out TFeatures extends TableFeatures, in out TData extends RowData, TValue extends CellData = CellData> {
    /** Numeric column: monospace, right-aligned, tabular figures (header aligned too). */
    numeric?: boolean
    /** Monospace without right alignment (IDs). IDs never truncate. */
    mono?: boolean
  }
}

export type Density = "compact" | "comfortable"

export interface RowMenuItem<T> {
  label: string
  onSelect: (row: T) => void
}

/** EC5: long names truncate with a tooltip carrying the full text. */
function TruncatedCell({ children, className }: { children: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Focusable so keyboard users can open the tooltip holding the full text (EC5) */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <span tabIndex={0} className={cn("block max-w-48 truncate rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  )
}

/** Visible and aria strings; every key is optional and defaults to English. */
export interface DataTableLabels {
  selectAll?: string
  selectRow?: string
  actions?: string
  rowActions?: string
  previousPage?: string
  nextPage?: string
  /** "3 selected" */
  selected?: (count: number) => string
  /** "120 rows" (virtualized) */
  rows?: (total: number) => string
  /** "1–10 of 42" */
  range?: (from: number, to: number, total: number) => string
  /** "Page 1 of 5" */
  page?: (page: number, pages: number) => string
}

const DEFAULT_LABELS: Required<DataTableLabels> = {
  selectAll: "Select all rows on this page",
  selectRow: "Select row",
  actions: "Actions",
  rowActions: "Row actions",
  previousPage: "Previous page",
  nextPage: "Next page",
  selected: (n) => `${n} selected`,
  rows: (n) => `${n} rows`,
  range: (from, to, total) => `${from}–${to} of ${total}`,
  page: (page, pages) => `Page ${page} of ${pages}`,
}

interface DataTableProps<T extends RowData> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Accessible table name. */
  label: string
  getRowId?: (row: T, index: number) => string
  selectable?: boolean
  onSelectionChange?: (rows: T[]) => void
  rowMenu?: (row: T) => RowMenuItem<T>[]
  density?: Density
  pageSize?: number
  stickyHeader?: boolean
  /**
   * Row virtualization: when the row count exceeds this (default 100) only the rows in view are mounted,
   * pagination is replaced by one scrolling list and the header is always sticky. Pass `Infinity` to disable.
   */
  virtualizeThreshold?: number
  /** Max height of the scroll area when stickyHeader is set. */
  maxHeightClassName?: string
  emptyMessage?: string
  /** Localised strings (partial; missing keys fall back to English). */
  labels?: DataTableLabels
  /** Extra attributes per row (e.g. the caller's own data-testid, aria-selected or a selection class). Applied after the
   * defaults, so they win (`className` is merged with the table's own row classes). */
  rowProps?: (row: T) => React.ComponentProps<"tr">
  /** Extra attributes on the root element (data-testid, data-*, id ...). */
  containerProps?: Omit<React.ComponentProps<"div">, "className" | "children">
  className?: string
}

/** Fixed row heights (px) used by virtualization; rows must not wrap (cells truncate, EC5). Matches h-9 / h-12. */
const VIRTUAL_ROW_PX = { compact: 36, comfortable: 48 } as const
const VIRTUAL_OVERSCAN = 8
const DEFAULT_VIEWPORT_PX = 384 // max-h-96

/** DAT-TABLE: generic TanStack wrapper (sort, select, paginate or virtualize, density, sticky header, row menu). */
function DataTable<T extends RowData>({
  columns,
  data,
  label,
  getRowId,
  selectable = false,
  onSelectionChange,
  rowMenu,
  density = "compact",
  pageSize = 10,
  stickyHeader = false,
  virtualizeThreshold = 100,
  maxHeightClassName = "max-h-96",
  emptyMessage = "No results.",
  labels,
  rowProps,
  containerProps,
  className,
}: DataTableProps<T>) {
  const L = React.useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})

  const allColumns = React.useMemo<DataTableColumn<T>[]>(() => {
    const out: DataTableColumn<T>[] = []
    if (selectable) {
      out.push({
        id: "_select",
        enableSorting: false,
        header: ({ table }) => (
          <Checkbox
            aria-label={L.selectAll}
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(v === true)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox aria-label={L.selectRow} checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(v === true)} />
        ),
      })
    }
    out.push(...columns)
    if (rowMenu) {
      out.push({
        id: "_actions",
        enableSorting: false,
        header: () => <span className="sr-only">{L.actions}</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={L.rowActions}>
                <MoreHorizontalIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {rowMenu(row.original).map((m) => (
                <DropdownMenuItem key={m.label} onSelect={() => m.onSelect(row.original)}>
                  {m.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      })
    }
    return out
  }, [columns, selectable, rowMenu, L])

  const virtual = data.length > virtualizeThreshold
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize })
  const [scroll, setScroll] = React.useState({ top: 0, height: DEFAULT_VIEWPORT_PX })
  const onScrollCapture = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement
    if (el.dataset.slot !== "table-container") return
    setScroll({ top: el.scrollTop, height: el.clientHeight })
  }

  const table = useTable({
    features,
    data,
    columns: allColumns,
    getRowId,
    state: { sorting, rowSelection, pagination: virtual ? { pageIndex: 0, pageSize: Math.max(data.length, 1) } : pagination },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: selectable,
  })

  React.useEffect(() => {
    onSelectionChange?.(table.getSelectedRowModel().rows.map((r) => r.original))
  }, [rowSelection]) // eslint-disable-line react-hooks/exhaustive-deps

  const { pageIndex, pageSize: size } = table.state.pagination
  const rows = table.getRowModel().rows
  const total = data.length
  const from = total === 0 ? 0 : pageIndex * size + 1
  const to = from === 0 ? 0 : from + rows.length - 1
  const cellPad = density === "compact" ? "px-2 py-1" : "px-3 py-3"
  const selectedCount = Object.keys(rowSelection).length

  const rowPx = VIRTUAL_ROW_PX[density]
  const first = virtual ? Math.max(0, Math.floor(scroll.top / rowPx) - VIRTUAL_OVERSCAN) : 0
  const last = virtual ? Math.min(rows.length, Math.ceil((scroll.top + scroll.height) / rowPx) + VIRTUAL_OVERSCAN) : rows.length
  const visibleRows = virtual ? rows.slice(first, last) : rows
  const padTop = first * rowPx
  const padBottom = (rows.length - last) * rowPx
  const sticky = stickyHeader || virtual

  return (
    <div
      {...containerProps}
      data-slot="data-table"
      data-density={density}
      data-virtualized={virtual ? "true" : undefined}
      onScrollCapture={virtual ? onScrollCapture : undefined}
      className={cn("flex flex-col gap-3", className)}>
      <Table
        aria-label={label}
        aria-rowcount={virtual ? rows.length + 1 : undefined}
        containerClassName={sticky ? cn("overflow-y-auto", maxHeightClassName) : undefined}
      >
        <TableHeader className={cn(sticky && "sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border)]")}>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className="hover:bg-transparent">
              {hg.headers.map((h) => {
                const meta = h.column.columnDef.meta
                const sorted = h.column.getIsSorted()
                return (
                  <TableHead
                    key={h.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : h.column.getCanSort() ? "none" : undefined}
                    className={cn(density === "compact" ? "h-8 px-2" : "h-10 px-3", "text-xs font-medium text-muted-foreground", meta?.numeric && "text-right")}
                  >
                    {h.isPlaceholder ? null : h.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={h.column.getToggleSortingHandler()}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded-sm px-1 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                          meta?.numeric && "flex-row-reverse",
                        )}
                      >
                        {<table.FlexRender header={h} />}
                        {sorted === "asc" ? (
                          <ArrowUpIcon aria-hidden className="size-3.5" />
                        ) : sorted === "desc" ? (
                          <ArrowDownIcon aria-hidden className="size-3.5" />
                        ) : (
                          <ArrowUpDownIcon aria-hidden className="size-3.5 opacity-60" />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={h} />
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length ? (
            <>
              {padTop > 0 ? <VirtualSpacer px={padTop} cols={allColumns.length} /> : null}
              {visibleRows.map((row, i) => {
              const extra = rowProps?.(row.original)
              return (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                aria-rowindex={virtual ? first + i + 2 : undefined}
                {...extra}
                className={cn(virtual && (density === "compact" ? "h-9" : "h-12"), extra?.className)}
              >
                {row.getAllCells().map((cell) => {
                  const meta = cell.column.columnDef.meta
                  return (
                    <TableCell key={cell.id} className={cn(cellPad, meta?.numeric && "text-right font-mono tabular-nums", meta?.mono && "font-mono")}>
                      {<table.FlexRender cell={cell} />}
                    </TableCell>
                  )
                })}
              </TableRow>
              )
              })}
              {padBottom > 0 ? <VirtualSpacer px={padBottom} cols={allColumns.length} /> : null}
            </>
          ) : (
            <TableRow>
              <TableCell colSpan={allColumns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span aria-live="polite">
          {selectable && selectedCount ? `${L.selected(selectedCount)} · ` : ""}
          {virtual ? L.rows(total) : L.range(from, to, total)}
        </span>
        {virtual ? null : <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label={L.previousPage}>
            <ChevronLeftIcon aria-hidden />
          </Button>
          <span className="tabular-nums">
            {L.page(pageIndex + 1, Math.max(table.getPageCount(), 1))}
          </span>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label={L.nextPage}>
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>}
      </div>
    </div>
  )
}

/** Empty row standing in for the unmounted rows above/below the window (keeps the scrollbar honest). */
function VirtualSpacer({ px, cols }: { px: number; cols: number }) {
  return (
    <tr aria-hidden>
      {/* Dynamic geometry: cannot be a token utility */}
      <td colSpan={cols} className="p-0" style={{ height: px }} />
    </tr>
  )
}

export { DataTable, TruncatedCell }
