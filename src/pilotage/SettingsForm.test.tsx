import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import * as deviceConfigApi from '../api/deviceConfig'
import { SettingsForm } from './SettingsForm'

describe('SettingsForm (KAN-163 FR7-FR10, FR12)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function stubConfig(config: Record<string, string | null>) {
    vi.spyOn(deviceConfigApi, 'fetchDeviceConfig').mockResolvedValue({
      deviceId: 'CHIP-001',
      contractId: 12,
      reglageId: 1,
      updatedAt: null,
      config,
    })
  }

  it('shows two visibly labeled groups, 5 transmitted + 5 stored-only fields (FR8, GAP6)', async () => {
    stubConfig({})
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    const transmitted = screen.getByTestId('settings-group-transmitted')
    expect(transmitted).toHaveTextContent('Transmises au device')
    expect(screen.getByTestId('settings-field-FREQ_MESURE_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-WAKEUP_ESP_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_TEMPAMB_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_HRAMB_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_MASSE_CL')).toBeInTheDocument()

    const storedOnly = screen.getByTestId('settings-group-stored-only')
    expect(storedOnly).toHaveTextContent('Conservées uniquement')
    expect(storedOnly).toHaveTextContent('jamais envoyées au device')
    expect(screen.getByTestId('settings-field-SeuilG_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_AccelG_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_LONG_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_LAT_CL')).toBeInTheDocument()
    expect(screen.getByTestId('settings-field-Seuil_TEMPMPU_CL')).toBeInTheDocument()
  })

  it('never renders the binary WiFi credential fields (FR12)', async () => {
    stubConfig({})
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    expect(screen.queryByTestId('settings-field-WiFi_SSID_CL')).not.toBeInTheDocument()
    expect(screen.queryByTestId('settings-field-WiFi_PASS_CL')).not.toBeInTheDocument()
  })

  it("shows the device's current config value as a placeholder, not a pre-filled value (FR7, CB8)", async () => {
    stubConfig({ FREQ_MESURE_CL: '3' })
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    const input = screen.getByTestId('settings-field-FREQ_MESURE_CL') as HTMLInputElement
    expect(input.placeholder).toBe('3')
    expect(input.value).toBe('')
  })

  it('labels a blank field as keeping the current value (FR10, CB14)', async () => {
    stubConfig({ FREQ_MESURE_CL: '3' })
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    expect(screen.getByTestId('settings-field-FREQ_MESURE_CL-hint')).toHaveTextContent(
      'laissez vide pour conserver la valeur actuelle (3)',
    )
  })

  it('rejects an out-of-range uint8 value client-side (FR9, CB13)', async () => {
    stubConfig({})
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '999')
    await user.click(screen.getByTestId('settings-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('settings-field-FREQ_MESURE_CL-error')).toHaveTextContent(
        'la valeur maximale est 255',
      ),
    )
  })

  it('normalizes a decimal comma to a dot for a float field before calling onSubmit (FR9, CB13)', async () => {
    stubConfig({})
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-Seuil_TEMPAMB_CL'), '19,5')
    await user.click(screen.getByTestId('settings-form-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith('CHIP-001', { Seuil_TEMPAMB_CL: '19.5' })
  })

  it('omits untouched (blank) fields from the submitted change set (FR10, CB14)', async () => {
    stubConfig({ FREQ_MESURE_CL: '3' })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-WAKEUP_ESP_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith('CHIP-001', { WAKEUP_ESP_CL: '10' })
  })

  it('shows an error state when the current configuration fails to load', async () => {
    vi.spyOn(deviceConfigApi, 'fetchDeviceConfig').mockRejectedValue(new Error('network error'))
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form-error')).toBeInTheDocument())
  })
})

describe('SettingsForm submit (KAN-166 FR11, FR13, FR20)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function stubConfig(config: Record<string, string | null>) {
    vi.spyOn(deviceConfigApi, 'fetchDeviceConfig').mockResolvedValue({
      deviceId: 'CHIP-001',
      contractId: 12,
      reglageId: 1,
      updatedAt: null,
      config,
    })
  }

  it('with no onSubmit prop supplied, posts to the real write endpoint by default (FR11)', async () => {
    stubConfig({})
    const postSpy = vi
      .spyOn(deviceConfigApi, 'postDeviceConfig')
      .mockResolvedValue({ deviceId: 'CHIP-001', contractId: 12, modifiedFields: ['FREQ_MESURE_CL'] })
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))

    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith('CHIP-001', { FREQ_MESURE_CL: '10' }),
    )
  })

  it('on acceptance shows a success flash and refreshes the displayed current config (FR11, FR13)', async () => {
    vi.spyOn(deviceConfigApi, 'fetchDeviceConfig')
      .mockResolvedValueOnce({
        deviceId: 'CHIP-001',
        contractId: 12,
        reglageId: 1,
        updatedAt: null,
        config: { FREQ_MESURE_CL: '3' },
      })
      .mockResolvedValueOnce({
        deviceId: 'CHIP-001',
        contractId: 12,
        reglageId: 2,
        updatedAt: null,
        config: { FREQ_MESURE_CL: '10' },
      })
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('settings-form-flash')).toHaveTextContent('Réglages enregistrés'),
    )
    await waitFor(() =>
      expect((screen.getByTestId('settings-field-FREQ_MESURE_CL') as HTMLInputElement).placeholder).toBe(
        '10',
      ),
    )
  })

  it('on a 409 contract_inactive, shows the API message verbatim and does not refresh the config (FR11)', async () => {
    stubConfig({ FREQ_MESURE_CL: '3' })
    const refetchSpy = vi.mocked(deviceConfigApi.fetchDeviceConfig)
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, "Ce contrat n'est pas actif aujourd'hui : aucun réglage ne peut être envoyé.", 'contract_inactive'),
      )
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('settings-form-flash')).toHaveTextContent(
        "Ce contrat n'est pas actif aujourd'hui",
      ),
    )
    expect(refetchSpy).toHaveBeenCalledTimes(1) // only the initial mount load, no post-failure refresh
    // KAN-173 (FR4): matches TransferForm's own reaction to this same signal —
    // once the API reports the contract inactive, the submit control stays
    // disabled rather than inviting another write that will only be refused again.
    expect(screen.getByTestId('settings-form-submit')).toBeDisabled()
  })

  it('on a 400 "no values changed" response, shows the API message as an informational flash (FR11)', async () => {
    stubConfig({ FREQ_MESURE_CL: '3' })
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        new ApiError(400, "Aucune valeur modifiée : la ligne n'a pas été créée.", 'invalid_body'),
      )
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '3')
    await user.click(screen.getByTestId('settings-form-submit'))

    const flash = await screen.findByTestId('settings-form-flash')
    expect(flash).toHaveTextContent('Aucune valeur modifiée')
    expect(flash).toHaveAttribute('data-flash-kind', 'info')
  })

  it('switching to a new device clears a previous flash (FR20)', async () => {
    stubConfig({})
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(500, 'boom'))
    const user = userEvent.setup()
    const { rerender } = render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))
    await waitFor(() => expect(screen.getByTestId('settings-form-flash')).toBeInTheDocument())

    rerender(<SettingsForm deviceId="CHIP-002" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.queryByTestId('settings-form-flash')).not.toBeInTheDocument())
  })

  it('drops a stale submit result once the operator has switched devices (FR20)', async () => {
    stubConfig({})
    let resolveSubmit: (() => void) | undefined
    const onSubmit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        }),
    )
    const user = userEvent.setup()
    const { rerender } = render(<SettingsForm deviceId="CHIP-001" onSubmit={onSubmit} />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())
    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

    // Operator switches device while CHIP-001's submit is still in flight.
    rerender(<SettingsForm deviceId="CHIP-002" onSubmit={onSubmit} />)
    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await act(async () => {
      resolveSubmit?.()
      await new Promise((r) => setTimeout(r, 0))
    })

    // The stale CHIP-001 success must never surface once CHIP-002 is shown.
    expect(screen.queryByTestId('settings-form-flash')).not.toBeInTheDocument()
  })
})
