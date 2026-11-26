import { BroadcastChannel as NodeBroadcastChannel } from 'node:worker_threads'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { answerTokenRequests, requestTokenFromOtherTabs } from './tabSession'

beforeAll(() => {
  vi.stubGlobal('BroadcastChannel', NodeBroadcastChannel)
})

const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((stop) => stop()))

describe('tabSession', () => {
  it('gets the token of a signed-in tab', async () => {
    stops.push(answerTokenRequests(() => 'tok-123'))
    await expect(requestTokenFromOtherTabs(1000)).resolves.toBe('tok-123')
  })

  it('gets nothing when no tab is signed in', async () => {
    stops.push(answerTokenRequests(() => null))
    await expect(requestTokenFromOtherTabs(50)).resolves.toBeNull()
  })

  it('gets nothing when no other tab is open', async () => {
    await expect(requestTokenFromOtherTabs(50)).resolves.toBeNull()
  })

  it('answers with the current token, not the one at registration', async () => {
    let token: string | null = 'old'
    stops.push(answerTokenRequests(() => token))
    token = 'new'
    await expect(requestTokenFromOtherTabs(1000)).resolves.toBe('new')
  })
})
