/**
 * Shares the in-memory bearer token with a newly opened tab of this app, so a link opened in a new tab does
 * not ask to sign in again. Nothing is written to storage (React-Auth-and-Session NFR3): a new tab asks the
 * open tabs over a same-origin BroadcastChannel, and a signed-in tab answers with its token. With no other
 * signed-in tab open, the new tab gets nothing and signs in as before.
 */

const CHANNEL = 'cpaltracker:session'
export const TOKEN_REQUEST_TIMEOUT_MS = 150

type Message = { type: 'request'; id: string } | { type: 'token'; id: string; token: string }

/** False where the browser (or test environment) has no BroadcastChannel: there is nobody to ask. */
export function canShareAcrossTabs(): boolean {
  return typeof BroadcastChannel === 'function'
}

function openChannel(): BroadcastChannel | null {
  return canShareAcrossTabs() ? new BroadcastChannel(CHANNEL) : null
}

/** Asks the other open tabs for their token; null when none answers within the timeout. */
export function requestTokenFromOtherTabs(timeoutMs = TOKEN_REQUEST_TIMEOUT_MS): Promise<string | null> {
  const channel = openChannel()
  if (!channel) return Promise.resolve(null)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve) => {
    const done = (token: string | null) => {
      clearTimeout(timer)
      channel.close()
      resolve(token)
    }
    const timer = setTimeout(() => done(null), timeoutMs)
    channel.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data
      if (message?.type === 'token' && message.id === id && typeof message.token === 'string') done(message.token)
    }
    channel.postMessage({ type: 'request', id } satisfies Message)
  })
}

/** Answers other tabs' token requests with this tab's current token, if any. Returns the stop function. */
export function answerTokenRequests(getToken: () => string | null): () => void {
  const channel = openChannel()
  if (!channel) return () => {}
  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data
    if (message?.type !== 'request') return
    const token = getToken()
    if (token) channel.postMessage({ type: 'token', id: message.id, token } satisfies Message)
  }
  return () => channel.close()
}
