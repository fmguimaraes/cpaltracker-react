import { useEffect, useState } from 'react'
import { fetchGlobalMessage, type Message } from '../api/messages'
import { Alert } from '@/ui/alert'
import { formatMessageDate } from './messageFormat'

/**
 * KAN-165 (FR11) — the always-shown global announcement, fetched once
 * per Live Tracking visit regardless of contract selection. Rendered as
 * a plain JSX text node, not `dangerouslySetInnerHTML` — React escapes
 * it automatically, so this already satisfies "never via raw innerHTML"
 * without needing rehype-sanitize: `contenu` is plain text in this API
 * (`T_MESSAGES.Contenu`), never markdown.
 *
 * A fetch failure here is informational-only (FR11 has no error AC) —
 * the box simply doesn't render, same as "no message exists".
 */
export function GlobalMessage() {
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchGlobalMessage()
      .then((result) => {
        if (!cancelled) setMessage(result)
      })
      .catch(() => {
        if (!cancelled) setMessage(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!message) return null

  return (
    <Alert data-testid="global-message" role="status" className="gap-1">
      <p className="text-muted-foreground">{formatMessageDate(message.date)}</p>
      <p className="whitespace-pre-line">{message.contenu}</p>
    </Alert>
  )
}
