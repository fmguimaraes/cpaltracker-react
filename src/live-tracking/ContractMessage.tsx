import { useEffect, useState } from 'react'
import { fetchContractMessage, type Message } from '../api/messages'
import { formatMessageDate } from './messageFormat'

/**
 * KAN-165 (FR12) — the latest message for the selected contract, hidden
 * entirely when none exists. Re-fetches whenever `contractId` changes;
 * see `GlobalMessage.tsx`'s header comment for why this is rendered as
 * plain JSX text rather than `dangerouslySetInnerHTML`.
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
    <div
      data-testid="contract-message"
      role="status"
      className="rounded-md border p-3 text-sm"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
    >
      <p style={{ color: 'var(--color-text-muted)' }}>{formatMessageDate(message.date)}</p>
      <p style={{ whiteSpace: 'pre-line' }}>{message.contenu}</p>
    </div>
  )
}
