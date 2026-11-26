import { SkeletonRows } from '@/ui/patterns/skeleton-rows'
import { Alert, AlertDescription } from '@/ui/alert'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { ShellBreadcrumb, type ShellBreadcrumbLevel } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageTitle } from '@/ui/patterns/shell-title'
import { useContracts } from '../contracts/ContractContext'
import { TRENDS_PATH } from '../auth/paths'
import { TrendsWorkspace } from '../trends/TrendsWorkspace'

/** The shell's breadcrumb pattern: page › view (the page's only view today). */
const TRENDS_LEVELS: ShellBreadcrumbLevel[] = [{ label: 'Tendances', to: TRENDS_PATH }, { label: 'Risque de péremption' }]

/** KAN-256 — Trends page (`/trends`): title in the top bar, the page fills the viewport below it. */
export function Trends() {
  const { contracts, loadState, selectedId, accessError, rejectContract } = useContracts()

  return (
    <div className="flex flex-col gap-3 px-4 py-3 md:h-page md:min-h-140 md:px-6">
      <ShellPageTitle>
        <ShellBreadcrumb levels={TRENDS_LEVELS} />
      </ShellPageTitle>
      {loadState === 'loading' && <SkeletonRows label="Chargement des contrats…" rows={1} rowClassName="h-9" testId="trends-contracts-loading" />}
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
  )
}
