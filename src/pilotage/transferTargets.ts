import { fetchContracts, type Contract } from '../api/contracts'

/**
 * KAN-169 (FR14) — the list of STD sub-contracts offered as transfer
 * targets.
 *
 * **Known/documented gap, not a workaround of gating logic (NFR4).** There
 * is no `/api/v1` endpoint that returns "the STD sub-contracts attached to
 * MAIN contract N" (confirmed by reading every file under
 * `cpaltracker.web/api/v1` — only `GET /contracts/list.php` (KAN-158, every
 * contract the caller can see) and `POST /devices/{deviceId}/transfer`
 * (KAN-123, which resolves and validates a *specific* target server-side
 * via `cpal_pilotage_std_cible()` — `ParentContratID` + `ContratType=STD`)
 * exist; there is no GET surface for the parent→children relationship at
 * all). This reuses `GET /contracts/list.php` and filters to
 * `contractType === 'STD'` client-side — the closest available proxy, not
 * an invented endpoint or a client-side reimplementation of the
 * parent/child attachment check (CB22/GAP5 remain server-only: an
 * unattached STD contract picked from this list is still rejected by the
 * server with `409 invalid_transfer_target`, exactly as today).
 *
 * This proxy is necessarily incomplete for a non-admin caller:
 * `cpal_contrats_visibles()` (`auth.php`) scopes a non-admin's
 * `/contracts/list.php` result to their own `ClientID` only, so a STD
 * sub-contract belonging to a different sub-client's `ClientID` — the
 * normal case this feature exists for — will not appear in the list at
 * all for that caller. Logged here, and in this story's handoff report, as
 * a genuine backend open question (a `GET
 * /contracts/{contractId}/transfer-targets`-shaped endpoint, scoped
 * server-side exactly like `cpal_pilotage_std_cible()` already is, would
 * resolve it) rather than worked around with a client-side query the
 * backend doesn't expose (feature spec §6 Out of Scope).
 */
export async function fetchTransferTargets(): Promise<Contract[]> {
  const contracts = await fetchContracts()
  return contracts.filter((contract) => contract.contractType === 'STD')
}
