import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContractProvider, CONTRACT_ACCESS_ERROR, useContracts, type ContractContextValue } from './ContractContext'

let ctx: ContractContextValue
let navigate: ReturnType<typeof useNavigate>

function Probe() {
  ctx = useContracts()
  navigate = useNavigate()
  return <span data-testid="probe">{ctx.loadState}</span>
}

function stubContracts(ids: number[], status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            status === 200
              ? { contracts: ids.map((id) => ({ contractId: id, contractRef: `REF-${id}`, contractType: 'STD' })) }
              : { error: { code: 'service_unavailable', message: 'down' } },
          ),
          { status },
        ),
      ),
    ),
  )
}

async function renderProvider(path = '/live-tracking') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ContractProvider>
        <Probe />
      </ContractProvider>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByTestId('probe')).not.toHaveTextContent('loading'))
}

describe('ContractProvider', () => {
  beforeEach(() => window.sessionStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('defaults to the first contract and remembers it', async () => {
    stubContracts([12, 34])
    await renderProvider()
    expect(ctx.selectedId).toBe(12)
    expect(ctx.selectedContract?.contractRef).toBe('REF-12')
    expect(window.sessionStorage.getItem('cpaltracker:contract')).toBe('12')
  })

  it('prefers the stored contract when still listed, else the first', async () => {
    window.sessionStorage.setItem('cpaltracker:contract', '34')
    stubContracts([12, 34])
    await renderProvider()
    expect(ctx.selectedId).toBe(34)
  })

  it('ignores a stored contract that is no longer listed', async () => {
    window.sessionStorage.setItem('cpaltracker:contract', '99')
    stubContracts([12, 34])
    await renderProvider()
    expect(ctx.selectedId).toBe(12)
  })

  it('a valid ?contrat_id= on arrival wins over the stored one; an invalid one is ignored', async () => {
    window.sessionStorage.setItem('cpaltracker:contract', '34')
    stubContracts([12, 34])
    await renderProvider('/history?contrat_id=12')
    expect(ctx.selectedId).toBe(12)
  })

  it('ignores a malformed deep link', async () => {
    stubContracts([12, 34])
    await renderProvider('/history?contrat_id=abc')
    expect(ctx.selectedId).toBe(12)
  })

  it('a deep link followed later wins once', async () => {
    stubContracts([12, 34])
    await renderProvider('/history')
    act(() => navigate('/history?contrat_id=34'))
    await waitFor(() => expect(ctx.selectedId).toBe(34))
  })

  it('selectContract changes and remembers the selection and clears the access error', async () => {
    stubContracts([12, 34])
    await renderProvider()
    act(() => ctx.rejectContract())
    expect(ctx.accessError).toBe(CONTRACT_ACCESS_ERROR)
    act(() => ctx.selectContract(34))
    expect(ctx.selectedId).toBe(34)
    expect(ctx.accessError).toBeNull()
    expect(window.sessionStorage.getItem('cpaltracker:contract')).toBe('34')
  })

  it('rejectContract clears the selection and the stored value and exposes the generic message', async () => {
    stubContracts([12, 34])
    await renderProvider()
    act(() => ctx.rejectContract())
    expect(ctx.selectedId).toBeNull()
    expect(window.sessionStorage.getItem('cpaltracker:contract')).toBeNull()
    expect(ctx.accessError).toBe("Ce contrat n'est pas disponible. Sélectionnez-en un autre.")
  })

  it('reports an error state on a service failure and selects nothing', async () => {
    stubContracts([], 503)
    await renderProvider()
    expect(ctx.loadState).toBe('error')
    expect(ctx.selectedId).toBeNull()
  })

  it('stays usable when sessionStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    stubContracts([12, 34])
    await renderProvider()
    expect(ctx.selectedId).toBe(12)
    act(() => ctx.selectContract(34))
    expect(ctx.selectedId).toBe(34)
  })
})
