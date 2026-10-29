import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as transferApi from '../api/transfer'
import * as transferTargetsModule from './transferTargets'
import { TransferForm } from './TransferForm'

const targets = [
  { contractId: 34, contractRef: 'REF-034-STD', contractType: 'STD' },
  { contractId: 56, contractRef: 'REF-056-STD', contractType: 'STD' },
]

type User = ReturnType<typeof userEvent.setup>

/** KAN-227: the target is the kit `Select` (radix): open the trigger, then pick the item. */
async function pickTarget(user: User, contractId: number) {
  await user.click(screen.getByTestId('transfer-field-target'))
  await user.click(await screen.findByTestId(`transfer-target-option-${contractId}`))
}

/** KAN-227: the dates are the kit `DateTimeField`: open its calendar (June 2026, the faked today) and pick the day. */
async function pickJune2026Day(user: User, fieldTestId: string, day: number) {
  await user.click(within(screen.getByTestId(fieldTestId)).getByRole('button'))
  await user.click(await screen.findByRole('button', { name: new RegExp(`June ${day}(st|nd|rd|th), 2026`) }))
}

describe('TransferForm (KAN-169 FR14-FR17)', () => {
  beforeEach(() => {
    // Radix Select relies on pointer capture and scrollIntoView, which jsdom does not implement.
    Element.prototype.hasPointerCapture ??= () => false
    Element.prototype.releasePointerCapture ??= () => undefined
    Element.prototype.scrollIntoView ??= () => undefined
    // Only Date is faked, so the calendars open on June 2026 while timers and user-event stay real.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 5, 1, 12, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function stubTargets(list = targets) {
    vi.spyOn(transferTargetsModule, 'fetchTransferTargets').mockResolvedValue(list)
  }

  it('offers only the API-provided STD contracts as transfer targets (FR14, CB22)', async () => {
    stubTargets()
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await userEvent.setup().click(screen.getByTestId('transfer-field-target'))
    expect(await screen.findByTestId('transfer-target-option-34')).toHaveTextContent('REF-034-STD')
    expect(screen.getByTestId('transfer-target-option-56')).toHaveTextContent('REF-056-STD')
  })

  it('shows an explicit empty state when no STD contract is available (FR14 gap)', async () => {
    stubTargets([])
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-targets-empty')).toBeInTheDocument())
  })

  it('requires a start date (FR15, CB23)', async () => {
    stubTargets()
    const user = userEvent.setup()
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('transfer-field-startDate-error')).toHaveTextContent(
        'La date de début est obligatoire.',
      ),
    )
  })

  it('rejects an end date that is not strictly after the start date client-side (FR16, CB24)', async () => {
    stubTargets()
    const user = userEvent.setup()
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await pickJune2026Day(user, 'transfer-field-startDate', 10)
    await pickJune2026Day(user, 'transfer-field-endDate', 10)
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('transfer-field-endDate-error')).toHaveTextContent(
        'La fin du transfert doit suivre son début.',
      ),
    )
  })

  it('treats an omitted end date as open-ended and submits the transfer (FR15, FR17)', async () => {
    stubTargets()
    const postSpy = vi.spyOn(transferApi, 'postDeviceTransfer').mockResolvedValue({
      deviceId: 'CHIP-001',
      contractId: 12,
      targetContractId: 34,
      targetClientId: 99,
      startDate: '2026-06-10',
      endDate: null,
      openEnded: true,
    })
    const onTransferred = vi.fn()
    const user = userEvent.setup()
    render(<TransferForm deviceId="CHIP-001" onTransferred={onTransferred} />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await pickJune2026Day(user, 'transfer-field-startDate', 10)
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('CHIP-001', {
        targetContractId: 34,
        startDate: '2026-06-10T00:00',
        endDate: null,
      }),
    )
    await waitFor(() => expect(screen.getByTestId('transfer-flash-ok')).toHaveTextContent('en cours'))
    expect(onTransferred).toHaveBeenCalledTimes(1)
  })

  it('sends both dates with their time as AAAA-MM-JJTHH:MM, the monolith datetime-local shape (KAN-227, FR10)', async () => {
    stubTargets()
    const postSpy = vi.spyOn(transferApi, 'postDeviceTransfer').mockResolvedValue({
      deviceId: 'CHIP-001',
      contractId: 12,
      targetContractId: 34,
      targetClientId: 99,
      startDate: '2026-06-10 08:30:00',
      endDate: '2026-06-12 17:45:59',
      openEnded: false,
    })
    const user = userEvent.setup()
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await pickJune2026Day(user, 'transfer-field-startDate', 10)
    // jsdom's time input rejects per-key partial values: set the whole value at once.
    fireEvent.change(screen.getByLabelText('Date de début (heure)'), { target: { value: '08:30' } })
    await pickJune2026Day(user, 'transfer-field-endDate', 12)
    fireEvent.change(screen.getByLabelText('Date de fin (heure)'), { target: { value: '17:45' } })
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('CHIP-001', {
        targetContractId: 34,
        startDate: '2026-06-10T08:30',
        endDate: '2026-06-12T17:45',
      }),
    )
  })

  it("surfaces the API's own rejection message verbatim (FR17, e.g. overlap)", async () => {
    stubTargets()
    vi.spyOn(transferApi, 'postDeviceTransfer').mockRejectedValue(
      new ApiError(409, 'Ce device fait déjà l\'objet d\'un transfert sur une période qui recouvre celle-ci.', 'transfer_overlap'),
    )
    const user = userEvent.setup()
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await pickJune2026Day(user, 'transfer-field-startDate', 10)
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('transfer-flash-ko')).toHaveTextContent(
        "Ce device fait déjà l'objet d'un transfert",
      ),
    )
  })

  it('disables the submit control after a 409 contract_inactive response (FR4/FR17 shared primitive)', async () => {
    stubTargets()
    vi.spyOn(transferApi, 'postDeviceTransfer').mockRejectedValue(
      new ApiError(409, "Ce contrat n'est pas actif aujourd'hui.", 'contract_inactive'),
    )
    const user = userEvent.setup()
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await pickJune2026Day(user, 'transfer-field-startDate', 10)
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() => expect(screen.getByTestId('transfer-contract-inactive')).toBeInTheDocument())
    expect(screen.getByTestId('transfer-form-submit')).toBeDisabled()
  })

  it('clears the contract-inactive disabled state when the operator switches devices', async () => {
    stubTargets()
    vi.spyOn(transferApi, 'postDeviceTransfer').mockRejectedValue(
      new ApiError(409, "Ce contrat n'est pas actif aujourd'hui.", 'contract_inactive'),
    )
    const user = userEvent.setup()
    const { rerender } = render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())

    await pickTarget(user, 34)
    await pickJune2026Day(user, 'transfer-field-startDate', 10)
    await user.click(screen.getByTestId('transfer-form-submit'))

    await waitFor(() => expect(screen.getByTestId('transfer-form-submit')).toBeDisabled())

    rerender(<TransferForm deviceId="CHIP-002" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form')).toBeInTheDocument())
    expect(screen.queryByTestId('transfer-contract-inactive')).not.toBeInTheDocument()
    expect(screen.getByTestId('transfer-form-submit')).not.toBeDisabled()
  })

  it('shows an error state when the target list fails to load', async () => {
    vi.spyOn(transferTargetsModule, 'fetchTransferTargets').mockRejectedValue(new Error('network error'))
    render(<TransferForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('transfer-form-error')).toBeInTheDocument())
  })
})
