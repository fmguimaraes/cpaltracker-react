import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { Skeleton } from '@/ui/skeleton'
import { useContracts } from '../contracts/ContractContext'

/**
 * What the two alert pages share before any alert is fetched: the global contract's own states (loading,
 * error, no contract, access refused). `children` receives the selected contract's id once there is one.
 */
export function AlertsContractGate({
  children,
  whileLoading,
}: {
  children: (contractId: number) => ReactNode
  /** KAN-344 (FR20): what shows while the contract list loads, in place of the generic bars (page shell shape). */
  whileLoading?: ReactNode
}) {
  const { contracts, loadState, selectedId, accessError } = useContracts()
  return (
    <>
      {loadState === 'loading' && whileLoading}
      {loadState === 'loading' && whileLoading === undefined && (
        <div data-testid="alerts-contracts-loading" role="status" aria-busy className="flex flex-col gap-2">
          <span className="sr-only">Chargement des contrats…</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )}
      {loadState === 'error' && (
        <Alert variant="danger" data-testid="alerts-contracts-error">
          <AlertDescription>Impossible de charger vos contrats. Réessayez plus tard.</AlertDescription>
        </Alert>
      )}
      {loadState === 'loaded' && contracts.length === 0 && (
        <Empty data-testid="alerts-contracts-empty">
          <EmptyHeader>
            <EmptyDescription>Aucun contrat n'est associé à votre compte.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {accessError && (
        <Alert variant="danger" data-testid="alerts-contract-access-error">
          <AlertDescription>{accessError}</AlertDescription>
        </Alert>
      )}
      {selectedId !== null && children(selectedId)}
    </>
  )
}
