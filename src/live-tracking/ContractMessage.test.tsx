import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContractMessage } from './ContractMessage'

function stubFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response.clone())),
  )
}

describe('ContractMessage (KAN-165 FR12)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the contract message as plain text when one exists', async () => {
    stubFetch(
      new Response(
        JSON.stringify({ message: { date: '2026-10-10T08:00:00+00:00', contenu: 'Retard de livraison.' } }),
        { status: 200 },
      ),
    )

    render(<ContractMessage contractId={12} />)

    await waitFor(() => expect(screen.getByTestId('contract-message')).toBeInTheDocument())
    expect(screen.getByText('Retard de livraison.')).toBeInTheDocument()
  })

  it('renders nothing when the contract has no message', async () => {
    stubFetch(new Response(JSON.stringify({ message: null }), { status: 200 }))

    render(<ContractMessage contractId={12} />)

    await waitFor(() => expect(screen.queryByTestId('contract-message')).not.toBeInTheDocument())
  })

  it('re-fetches and clears the old message when contractId changes', async () => {
    let requestedContractId: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        requestedContractId = new URL(url).searchParams.get('contractId')
        const contenu = requestedContractId === '12' ? 'Message du contrat 12' : null
        return Promise.resolve(
          new Response(JSON.stringify({ message: contenu ? { date: null, contenu } : null }), {
            status: 200,
          }),
        )
      }),
    )

    const { rerender } = render(<ContractMessage contractId={12} />)
    await waitFor(() => expect(screen.getByText('Message du contrat 12')).toBeInTheDocument())

    rerender(<ContractMessage contractId={34} />)
    await waitFor(() => expect(requestedContractId).toBe('34'))
    await waitFor(() => expect(screen.queryByTestId('contract-message')).not.toBeInTheDocument())
  })
})
