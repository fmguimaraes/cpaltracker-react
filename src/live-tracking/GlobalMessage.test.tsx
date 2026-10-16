import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GlobalMessage } from './GlobalMessage'

function stubFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response.clone())),
  )
}

describe('GlobalMessage (KAN-165 FR11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the latest global message as plain text, never raw HTML', async () => {
    stubFetch(
      new Response(
        JSON.stringify({ message: { date: '2026-10-10T08:00:00+00:00', contenu: '<b>Hi</b>' } }),
        { status: 200 },
      ),
    )

    render(<GlobalMessage />)

    await waitFor(() => expect(screen.getByTestId('global-message')).toBeInTheDocument())
    expect(screen.getByText('<b>Hi</b>')).toBeInTheDocument()
    expect(screen.queryByText('Hi')).not.toBeInTheDocument()
    expect(document.querySelector('b')).not.toBeInTheDocument()
  })

  it('renders nothing when there is no global message', async () => {
    stubFetch(new Response(JSON.stringify({ message: null }), { status: 200 }))

    render(<GlobalMessage />)

    await waitFor(() => expect(screen.queryByTestId('global-message')).not.toBeInTheDocument())
  })

  it('renders nothing on a fetch failure', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'down' } }), {
        status: 503,
      }),
    )

    render(<GlobalMessage />)

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(screen.queryByTestId('global-message')).not.toBeInTheDocument()
  })
})
