import { fetchContractTransferTargets, type TransferTarget } from '../api/contracts'

/**
 * KAN-169 (FR14) — the STD sub-contracts offered as transfer targets for a
 * MAIN contract, from `GET /api/v1/contracts/transfer-targets.php/{id}`.
 *
 * The server owns the parent/child definition (`cpal_pilotage_std_cibles()`
 * in `pilotage_logic.php`, the list form of the `cpal_pilotage_std_cible()`
 * check the transfer POST applies) and the authorization of the MAIN
 * contract, so this never filters or re-derives anything client-side: what
 * comes back is exactly what the transfer endpoint will accept. (It replaces
 * the former proxy over `/contracts/list.php`, which a non-admin could never
 * fill with sub-clients' contracts.)
 */
export async function fetchTransferTargets(mainContractId: number): Promise<TransferTarget[]> {
  return fetchContractTransferTargets(mainContractId)
}

/** The select's text for a target: "REF · client name" (the reference alone when the client is unknown). */
export function transferTargetLabel(target: TransferTarget): string {
  return target.clientName ? `${target.contractRef} · ${target.clientName}` : target.contractRef
}
