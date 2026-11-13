import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { fetchContracts, type Contract } from '../api/contracts'
import { defaultContractId, writeStoredContractId } from './rememberedContract'

export type ContractLoadState = 'loading' | 'loaded' | 'error'

/** Same text/markup as `HistoryAccessGate`'s own message (NFR5): never reveals which contracts exist. */
export const CONTRACT_ACCESS_ERROR = "Ce contrat n'est pas disponible. Sélectionnez-en un autre."

export interface ContractContextValue {
  contracts: Contract[]
  loadState: ContractLoadState
  selectedId: number | null
  selectedContract: Contract | null
  /** Generic French message set by `rejectContract()`, cleared by the next selection. */
  accessError: string | null
  selectContract: (contractId: number) => void
  /** A page got a 404 for the selected contract: clear the selection and the remembered value. */
  rejectContract: () => void
}

const ContractContext = createContext<ContractContextValue | null>(null)

function parseDeepLink(search: string): number | null {
  const raw = new URLSearchParams(search).get('contrat_id')
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Operator decision 2026-10-29 — the contract is GLOBAL to the app, not per page. Mounted once inside the
 * authenticated shell: fetches the contract list once (already scoped server-side, FR2 — never filtered by
 * role here), holds the selection, and remembers it for the browser session under `cpaltracker:contract`.
 * Default = remembered contract if still listed, else the first one. A valid `?contrat_id=` on arrival at any
 * page wins once (it is not re-validated client-side: the page's own fetch decides, via 404 -> `rejectContract`).
 */
export function ContractProvider({ children }: { children: ReactNode }) {
  const { search } = useLocation()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadState, setLoadState] = useState<ContractLoadState>('loading')
  const [selectedId, setSelectedId] = useState<number | null>(() => parseDeepLink(search))
  const [accessError, setAccessError] = useState<string | null>(null)
  const handledSearch = useRef(search)

  // A deep link followed later (e.g. an in-app `?contrat_id=`) wins once, like on first arrival.
  useEffect(() => {
    if (handledSearch.current === search) return
    handledSearch.current = search
    const linked = parseDeepLink(search)
    if (linked !== null) {
      setAccessError(null)
      setSelectedId(linked)
    }
  }, [search])

  // Remember whichever contract is on screen (picked, deep-linked or defaulted).
  useEffect(() => {
    if (selectedId !== null) writeStoredContractId(selectedId)
  }, [selectedId])

  useEffect(() => {
    let cancelled = false
    fetchContracts()
      .then((result) => {
        if (cancelled) return
        setContracts(result)
        setSelectedId((current) => current ?? defaultContractId(result))
        setLoadState('loaded')
      })
      .catch(() => {
        if (cancelled) return
        setLoadState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<ContractContextValue>(
    () => ({
      contracts,
      loadState,
      selectedId,
      selectedContract: contracts.find((c) => c.contractId === selectedId) ?? null,
      accessError,
      selectContract: (contractId) => {
        setAccessError(null)
        setSelectedId(contractId)
      },
      rejectContract: () => {
        setSelectedId(null)
        // A rejected contract must not be offered again as the remembered default.
        writeStoredContractId(null)
        setAccessError(CONTRACT_ACCESS_ERROR)
      },
    }),
    [contracts, loadState, selectedId, accessError],
  )

  return <ContractContext.Provider value={value}>{children}</ContractContext.Provider>
}

export function useContracts(): ContractContextValue {
  const value = useContext(ContractContext)
  if (!value) throw new Error('useContracts must be used inside <ContractProvider>')
  return value
}
