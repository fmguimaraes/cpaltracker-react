import { apiClient } from './client'

/**
 * `GET /api/v1/contracts/list.php` (KAN-158) — `clientId`/`clientName` are
 * present only for an admin caller; the backend strips them entirely for a
 * non-admin rather than this type making them merely optional for everyone.
 * The UI must never re-derive that disclosure itself (FR2, no client-held
 * role used for gating/disclosure) — a contract's presence or absence of
 * `clientName` IS the authorization signal.
 */
export interface Contract {
  contractId: number
  contractRef: string
  contractType: string
  clientId?: number | null
  clientName?: string | null
}

interface ContractsListResponse {
  contracts: Contract[]
}

export async function fetchContracts(): Promise<Contract[]> {
  const body = await apiClient.get<ContractsListResponse>('/contracts/list.php')
  return body.contracts ?? []
}

/**
 * One STD sub-contract a device of a MAIN contract can be transferred to
 * (`GET /api/v1/contracts/transfer-targets.php/{mainContractId}`). `start`/`end`
 * are the contract's own bounds as stored (null = open); `clientName` is the
 * sub-client's name, null when unknown.
 */
export interface TransferTarget {
  contractId: number
  contractRef: string
  clientName: string | null
  start: string | null
  end: string | null
}

interface TransferTargetsResponse {
  targets: TransferTarget[]
}

export async function fetchContractTransferTargets(mainContractId: number): Promise<TransferTarget[]> {
  const body = await apiClient.get<TransferTargetsResponse>(`/contracts/transfer-targets.php/${mainContractId}`)
  return body.targets ?? []
}
