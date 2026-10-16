import { apiClient } from './client'

/**
 * `POST /api/v1/devices/{deviceId}/transfer` (KAN-123, physically served
 * from `api/v1/devices/transfer.php?deviceId=...`) — KAN-169 (FR14-FR18).
 *
 * Request/response shapes confirmed against
 * `cpaltracker.web/api/openapi.yaml` (`/devices/transfer.php/{deviceId}`)
 * and `cpaltracker.web/api/v1/devices/transfer.php` directly (not invented):
 * body is `{ targetContractId, startDate, endDate? }`; a successful transfer
 * replies `201` with `{ deviceId, contractId, targetContractId,
 * targetClientId, startDate, endDate, openEnded }` — `endDate` is `null` and
 * `openEnded` is `true` for an open-ended transfer (CB23, the
 * `HIST_SENTINELLE` end date is never sent to the client as a literal
 * string).
 *
 * Rejections are real `/api/v1` error codes, never computed here (FR17,
 * NFR4): `409 contract_inactive` (source contract not active today),
 * `409 invalid_transfer_target` (not a STD contract attached to this MAIN
 * contract), `409 transfer_target_window` / `409 transfer_overlap`, or
 * `400 invalid_body`. `src/pilotage/activeState.ts`'s
 * `isContractInactiveError()` recognizes the first of those; the rest are
 * surfaced verbatim via `ApiError.message` by `TransferForm`.
 */
export interface TransferResult {
  deviceId: string
  contractId: number
  targetContractId: number
  targetClientId: number
  startDate: string
  endDate: string | null
  openEnded: boolean
}

export async function postDeviceTransfer(
  deviceId: string,
  input: { targetContractId: number; startDate: string; endDate?: string | null },
): Promise<TransferResult> {
  return apiClient.post<TransferResult>(
    `/devices/transfer.php?deviceId=${encodeURIComponent(deviceId)}`,
    {
      targetContractId: input.targetContractId,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    },
  )
}
