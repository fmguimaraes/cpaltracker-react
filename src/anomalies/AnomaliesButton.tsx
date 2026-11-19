import { useState } from 'react'
import { STATUS_FILTER_OPTIONS, type StatusFilter } from './anomalyFormat'
import { AnomalyDetail } from './AnomalyDetail'
import { AnomalyList } from './AnomalyList'
import { Button } from '@/ui/button'
import { NativeSelect, NativeSelectOption } from '@/ui/native-select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/ui/sheet'

/**
 * KAN-261: a self-contained "Anomalies" button opening a right-side drawer with the contract's anomalies
 * (table with a status filter, the 200 most recent) and, per row, the anomaly's detail and status history.
 * The drawer is not a route and does not touch the URL. Mounted by the Pulse page.
 */
export function AnomaliesButton({ contractId }: { contractId: number }) {
  const [filter, setFilter] = useState<StatusFilter>('open')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  return (
    <Sheet onOpenChange={(open) => open || setSelectedKey(null)}>
      <SheetTrigger asChild>
        <Button variant="outline" data-testid="anomalies-button">
          Anomalies
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-3xl" data-testid="anomalies-drawer">
        <SheetHeader>
          <SheetTitle>Anomalies</SheetTitle>
          <SheetDescription>Anomalies de mesure du contrat, les 200 plus récentes.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {selectedKey === null ? (
            <>
              <NativeSelect
                aria-label="Filtrer par statut"
                data-testid="anomaly-status-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value as StatusFilter)}
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <AnomalyList contractId={contractId} filter={filter} onSelect={setSelectedKey} />
            </>
          ) : (
            <AnomalyDetail contractId={contractId} anomalyKey={selectedKey} onBack={() => setSelectedKey(null)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
