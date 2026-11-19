import { Alert, AlertDescription } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { PageHeader } from '@/ui/patterns/page-header'
import { Skeleton } from '@/ui/skeleton'
import { useContracts } from '../contracts/ContractContext'
import { TrendsWorkspace } from '../trends/TrendsWorkspace'

/** KAN-256 — Trends page (`/trends`): the selected contract's lots as a risk quadrant and a table. */
export function Trends() {
  const { contracts, loadState, selectedId, accessError, rejectContract } = useContracts()

  return (
    <div className="flex flex-col">
      <PageHeader title="Tendances" />
      <div className="flex flex-col gap-6 p-4 md:p-6">
        {loadState === 'loading' && <Skeleton className="h-9 w-full" />}
        {loadState === 'error' && (
          <Alert variant="danger" data-testid="trends-contracts-error">
            <AlertDescription>Impossible de charger vos contrats. Réessayez plus tard.</AlertDescription>
          </Alert>
        )}
        {loadState === 'loaded' && contracts.length === 0 && (
          <Empty data-testid="trends-no-contract">
            <EmptyHeader>
              <EmptyDescription>Aucun contrat n'est associé à votre compte.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {accessError && (
          <Alert variant="danger" data-testid="trends-access-error">
            <AlertDescription>{accessError}</AlertDescription>
          </Alert>
        )}
        {selectedId !== null && <TrendsWorkspace contractId={selectedId} onUnauthorized={rejectContract} />}
      </div>
    </div>
  )
}
