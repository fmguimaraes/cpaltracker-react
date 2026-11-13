import type { Contract } from '../api/contracts'

/**
 * Operator decision 2026-10-29: ONE remembered contract shared by History and Live Tracking, kept for the
 * browser session — a contract picked on one page is pre-selected on the other.
 */
export const REMEMBERED_CONTRACT_STORAGE_KEY = 'cpaltracker:contract'

export function readStoredContractId(): number | null {
  try {
    const parsed = Number(window.sessionStorage.getItem(REMEMBERED_CONTRACT_STORAGE_KEY))
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredContractId(contractId: number | null) {
  try {
    if (contractId === null) window.sessionStorage.removeItem(REMEMBERED_CONTRACT_STORAGE_KEY)
    else window.sessionStorage.setItem(REMEMBERED_CONTRACT_STORAGE_KEY, String(contractId))
  } catch {
    // Storage unavailable (private mode, quota): remembering the choice is best-effort only.
  }
}

/**
 * The contract shown when no deep link names one: the remembered contract if the caller still has it,
 * otherwise the first one. Only ids the server just returned are candidates, so this never widens access (FR2).
 */
export function defaultContractId(contracts: Contract[]): number | null {
  const stored = readStoredContractId()
  if (stored !== null && contracts.some((contract) => contract.contractId === stored)) return stored
  return contracts[0]?.contractId ?? null
}
