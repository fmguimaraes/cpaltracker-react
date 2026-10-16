import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { isNoChangeError, postDeviceConfig } from './deviceConfig'
import { setAuthToken } from './client'

/**
 * KAN-166 (FR11) — `postDeviceConfig()` is the settings form's real write
 * path (`SettingsForm.tsx`'s default `onSubmit`); `isNoChangeError()` is the
 * predicate that lets its result handling tell CB15's "no values changed"
 * rejection apart from a generic validation failure, the same way
 * `isContractInactiveError()` (KAN-159) already does for the 409 case.
 */
describe('postDeviceConfig (FR11)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    setAuthToken(null)
  })

  it('POSTs the change set to the device config endpoint and returns the 202 body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ deviceId: 'CHIP-001', contractId: 12, modifiedFields: ['FREQ_MESURE_CL'] }),
        { status: 202 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await postDeviceConfig('CHIP-001', { FREQ_MESURE_CL: '10' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/devices/config.php?deviceId=CHIP-001')
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ FREQ_MESURE_CL: '10' }))
    expect(result).toEqual({ deviceId: 'CHIP-001', contractId: 12, modifiedFields: ['FREQ_MESURE_CL'] })
  })

  it('throws the API error (e.g. 409 contract_inactive) rather than swallowing it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'contract_inactive',
            message: "Ce contrat n'est pas actif aujourd'hui : aucun réglage ne peut être envoyé.",
          },
        }),
        { status: 409 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(postDeviceConfig('CHIP-001', {})).rejects.toMatchObject({
      status: 409,
      code: 'contract_inactive',
    })
  })
})

describe('isNoChangeError (FR11, CB15)', () => {
  it('matches a 400 with the exact "no values changed" message', () => {
    const error = new ApiError(400, "Aucune valeur modifiée : la ligne n'a pas été créée.", 'invalid_body')
    expect(isNoChangeError(error)).toBe(true)
  })

  it('does not match a different 400 invalid_body message (e.g. a rejected field value)', () => {
    const error = new ApiError(400, 'Fréquence de mesure must be an integer ≤ 255.', 'invalid_body')
    expect(isNoChangeError(error)).toBe(false)
  })

  it('does not match a 409 contract_inactive error', () => {
    const error = new ApiError(409, "Ce contrat n'est pas actif aujourd'hui : aucun réglage ne peut être envoyé.", 'contract_inactive')
    expect(isNoChangeError(error)).toBe(false)
  })

  it('does not match a non-ApiError', () => {
    expect(isNoChangeError(new Error("Aucune valeur modifiée : la ligne n'a pas été créée."))).toBe(false)
  })
})
