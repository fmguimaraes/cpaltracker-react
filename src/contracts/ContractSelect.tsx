import { FileText } from 'lucide-react'
import { Button } from '@/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import { useSidebar } from '@/ui/sidebar'
import type { Contract } from '../api/contracts'
import { useContracts } from './ContractContext'

function label(contract: Contract): string {
  return `${contract.contractRef}${contract.clientName ? ` (${contract.clientName})` : ''}`
}

/** The kit `Select` of "REF (Client)" items bound to the global selection (no sidebar awareness). */
export function ContractPicker() {
  const { contracts, loadState, selectedId, selectContract } = useContracts()
  if (loadState !== 'loaded' || contracts.length === 0) return null
  return (
    <Select
      value={selectedId === null ? '' : String(selectedId)}
      onValueChange={(value) => {
        if (value) selectContract(Number(value))
      }}
    >
      <SelectTrigger data-testid="contract-selector" aria-label="Sélection du contrat" className="w-full">
        <SelectValue placeholder="Choisir un contrat" />
      </SelectTrigger>
      <SelectContent position="popper">
        {contracts.map((contract) => (
          <SelectItem key={contract.contractId} value={String(contract.contractId)} data-testid={`contract-option-${contract.contractId}`}>
            {label(contract)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Global contract picker (operator decision 2026-10-29), mounted at the top of the sidebar through the shell's
 * `sidebarTop` slot: kit `Select` of "REF (Client)" items, full sidebar width. On the collapsed icon rail it is a
 * single icon button ("Contrat : REF") that expands the sidebar. Renders nothing until contracts are loaded and
 * while there are none (pages show the loading/error/empty states). A non-admin with only one contract has
 * nothing to pick between, so it's hidden for them too; an admin sees it whenever there's at least one.
 */
export function ContractSelect({ isAdmin }: { isAdmin: boolean }) {
  const { contracts, loadState, selectedContract } = useContracts()
  const { state, isMobile, setOpen } = useSidebar()
  if (loadState !== 'loaded' || contracts.length === 0) return null
  if (!isAdmin && contracts.length <= 1) return null

  if (state === 'collapsed' && !isMobile) {
    const name = selectedContract ? label(selectedContract) : 'aucun'
    return (
      <div data-testid="sidebar-top" className="px-2 pt-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Contrat : ${name}`}
          title={`Contrat : ${name}`}
          data-testid="contract-selector-collapsed"
          onClick={() => setOpen(true)}
        >
          <FileText aria-hidden />
        </Button>
      </div>
    )
  }

  return (
    <div data-testid="sidebar-top" className="px-2 pt-2">
      <ContractPicker />
    </div>
  )
}
