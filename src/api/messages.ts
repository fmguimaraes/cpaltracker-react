import { apiClient } from './client'

/** KAN-165 (FR11/FR12) — `/api/v1/messages/*`'s shared response shape. */
export interface Message {
  date: string | null
  contenu: string
}

interface MessageResponse {
  message: Message | null
}

export async function fetchContractMessage(contractId: number): Promise<Message | null> {
  const body = await apiClient.get<MessageResponse>(`/messages/contract.php?contractId=${contractId}`)
  return body.message ?? null
}
