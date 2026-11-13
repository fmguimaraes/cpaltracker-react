import { useEffect, useState } from 'react'
import { fetchContractMessage, type Message } from '../api/messages'
import { Alert } from '@/ui/alert'
import { formatMessageDate } from './messageFormat'

/**
 * KAN-165 (FR12) — the latest message for the selected contract, hidden
 * entirely when none exists. Re-fetches whenever `contractId` changes.
 * Rendered as a plain JSX text node, not `dangerouslySetInnerHTML` — React
 * escapes it, and `contenu` is plain text in this API (`T_MESSAGES.Contenu`).
 */
export function ContractMessage({ contractId }: { contractId: number }) {
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    let cancelled = false
    setMessage(null)
    fetchContractMessage(contractId)
      .then((result) => {
        if (!cancelled) setMessage(result)
      })
      .catch(() => {
        if (!cancelled) setMessage(null)
      })
    return () => {
      cancelled = true
    }
  }, [contractId])

  if (!message) return null

  return (
    <Alert data-testid="contract-message" role="status" className="gap-1">
      <p className="text-muted-foreground">{formatMessageDate(message.date)}</p>
      <p className="whitespace-pre-line">{message.contenu}</p>
    </Alert>
  )
}
