import type { ReactNode } from 'react'
import { ContractProvider } from './ContractContext'
import { ContractPicker } from './ContractSelect'

/** Test helper: the provider plus the picker the sidebar would show, without needing the whole app shell. */
export function ContractTestShell({ children }: { children: ReactNode }) {
  return (
    <ContractProvider>
      <ContractPicker />
      {children}
    </ContractProvider>
  )
}
