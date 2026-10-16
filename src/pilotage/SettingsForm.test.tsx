import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('does not call onSubmit (and shows no network side effect) with no onSubmit prop supplied — the KAN-166 stub', async () => {
    stubConfig({})
    const user = userEvent.setup()
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form')).toBeInTheDocument())

    await user.type(screen.getByTestId('settings-field-FREQ_MESURE_CL'), '10')
    await user.click(screen.getByTestId('settings-form-submit'))

    // No assertion target for a no-op beyond "it doesn't throw/hang" —
    // actual submission feedback is KAN-166's story.
    await waitFor(() => expect(screen.getByTestId('settings-form-submit')).not.toBeDisabled())
  })

  it('shows an error state when the current configuration fails to load', async () => {
    vi.spyOn(deviceConfigApi, 'fetchDeviceConfig').mockRejectedValue(new Error('network error'))
    render(<SettingsForm deviceId="CHIP-001" />)

    await waitFor(() => expect(screen.getByTestId('settings-form-error')).toBeInTheDocument())
  })
})
