import { Skeleton } from '@/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/table'

const ROWS = 6

/**
 * KAN-344 (FR19/FR23): the device list while the Pilotage workspace loads, shaped like what replaces it:
 * the `DataTable` (real column headers, skeleton rows) from md, the `MobileList` cards below md. The
 * breakpoint is CSS-only, so both shapes exist in the DOM but only one is displayed. One
 * `role="status"` region, announced in French, removed with the skeleton.
 */
export function DeviceListSkeleton() {
  return (
    <div data-testid="pilotage-loading" role="status" aria-busy>
      <span className="sr-only">Chargement du pilotage…</span>
      <div className="hidden md:block" data-testid="pilotage-loading-table" aria-hidden>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16">Statut</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Dernière position</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: ROWS }, (_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="size-3 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-56" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" data-testid="pilotage-loading-cards" aria-hidden>
        {Array.from({ length: ROWS }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <Skeleton surface="card" className="h-4 w-40" />
            <Skeleton surface="card" className="h-3 w-56" />
          </li>
        ))}
      </ul>
    </div>
  )
}
