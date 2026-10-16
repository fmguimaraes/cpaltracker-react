import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientLogo } from './ClientLogo'

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      return Promise.resolve(handler(url))
    }),
  )
}

describe('ClientLogo (KAN-165 FR13)', () => {
  beforeEach(() => {
    // jsdom doesn't implement these at all (not even as a stub), so there is
    // nothing to vi.spyOn() yet — they're assigned directly instead.
    URL.createObjectURL = vi.fn(() => 'blob:mock-logo-url')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the logo once the flag reports true', async () => {
    stubFetch((url) =>
      url.includes('logo-flag.php')
        ? new Response(JSON.stringify({ hasLogo: true }), { status: 200 })
        : new Response(new Blob(['fake-png']), { status: 200 }),
    )

    render(<ClientLogo />)

    await waitFor(() => expect(screen.getByTestId('client-logo')).toHaveAttribute('src', 'blob:mock-logo-url'))
  })

  it('renders nothing when the flag reports false, without fetching the image', async () => {
    const imageFetch = vi.fn()
    stubFetch((url) => {
      if (url.includes('logo-flag.php')) return new Response(JSON.stringify({ hasLogo: false }), { status: 200 })
      imageFetch()
      return new Response(new Blob(['fake-png']), { status: 200 })
    })

    render(<ClientLogo />)

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument()
    expect(imageFetch).not.toHaveBeenCalled()
  })

  it('renders nothing when the flag check itself fails', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'no' } }), { status: 401 }))

    render(<ClientLogo />)

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument()
  })

  it('hides on an onError event from the <img> itself', async () => {
    stubFetch((url) =>
      url.includes('logo-flag.php')
        ? new Response(JSON.stringify({ hasLogo: true }), { status: 200 })
        : new Response(new Blob(['fake-png']), { status: 200 }),
    )

    render(<ClientLogo />)

    const img = await screen.findByTestId('client-logo')
    img.dispatchEvent(new Event('error'))

    await waitFor(() => expect(screen.queryByTestId('client-logo')).not.toBeInTheDocument())
  })
})
