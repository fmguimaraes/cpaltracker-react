import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryAccessGate } from './HistoryAccessGate'

function historyBody() {
  return {
    contract: {
      ContratID: 12,
      ContratRef: 'REF-12',
      ContratType: 'STANDARD',
      ClientID: 1,
      DebutContrat: null,
      FinContrat: null,
    },
    devices: [],
    rows: [],
    hooks: [],
    count: 0,
    total: 0,
    sampled: false,
  }
}

function stubFetch(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response.clone())),
  )
}

describe('HistoryAccessGate (KAN-172 FR25, NFR5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a loading placeholder before the history fetch resolves', () => {
    stubFetch(new Response(JSON.stringify(historyBody()), { status: 200 }))

    render(
      <HistoryAccessGate contractId={12}>{() => <p data-testid="child">child</p>}</HistoryAccessGate>,
    )

    expect(screen.getByTestId('history-access-loading')).toBeInTheDocument()
  })

  it('renders children with the resolved range/history once access is confirmed', async () => {
    stubFetch(new Response(JSON.stringify(historyBody()), { status: 200 }))

    render(
      <HistoryAccessGate contractId={12}>
        {(resolved) => <p data-testid="child">{resolved.history.contract.ContratRef}</p>}
      </HistoryAccessGate>,
    )

    await waitFor(() => expect(screen.getByTestId('child')).toHaveTextContent('REF-12'))
  })

  it('shows the merged access-denied message on a 404, identical for "nonexistent" and "not yours", and never cites the contract id', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
      }),
    )

    render(
      <HistoryAccessGate contractId={999}>{() => <p data-testid="child">child</p>}</HistoryAccessGate>,
    )

    await waitFor(() => expect(screen.getByTestId('history-access-error')).toBeInTheDocument())
    expect(screen.getByTestId('history-access-error')).toHaveAttribute('role', 'alert')
    expect(screen.getByTestId('history-access-error')).not.toHaveTextContent('999')
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('calls onUnauthorized exactly once when access is denied', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
      }),
    )
    const onUnauthorized = vi.fn()

    render(
      <HistoryAccessGate contractId={999} onUnauthorized={onUnauthorized}>
        {() => <p data-testid="child">child</p>}
      </HistoryAccessGate>,
    )

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
  })

  it('shows a generic fetch-error message (distinct from the access-denied one) on a service failure', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB down' } }), {
        status: 503,
      }),
    )

    render(
      <HistoryAccessGate contractId={12}>{() => <p data-testid="child">child</p>}</HistoryAccessGate>,
    )

    await waitFor(() => expect(screen.getByTestId('history-fetch-error')).toBeInTheDocument())
    expect(screen.queryByTestId('history-access-error')).not.toBeInTheDocument()
  })

  it('the fetch-error banner is dismissible (KAN-175 FR4, FR23)', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB down' } }), {
        status: 503,
      }),
    )

    render(
      <HistoryAccessGate contractId={12}>{() => <p data-testid="child">child</p>}</HistoryAccessGate>,
    )

    await waitFor(() => expect(screen.getByTestId('history-fetch-error')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('history-fetch-error-dismiss'))
    expect(screen.queryByTestId('history-fetch-error')).not.toBeInTheDocument()
  })
})
