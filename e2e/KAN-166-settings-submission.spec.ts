import { test, expect } from '@playwright/test'

/**
 * KAN-166 (epic KAN-140) — Settings Submission, Feedback & Refresh Safety.
 * Covers FR11, FR13, FR20. Mirrors KAN-159/KAN-163's mocking pattern — every
 * `/api/v1` call is mocked via `page.route`, never a live backend (NFR2).
 *
 * Wires `SettingsForm`'s real `onSubmit` (`postDeviceConfig()`,
 * `src/api/deviceConfig.ts`) against `POST /devices/config.php`: accepted /
 * "no values changed" / "contract not active" result feedback (FR11),
 * post-success config refresh (FR13), and refresh safety — a browser
 * reload after a submit never re-sends the POST (FR20).
 */

const account = {
  userId: 1,
  clientId: 7,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

async function mockEligibleWorkspace(
  page: import('@playwright/test').Page,
  options: {
    config?: Record<string, string | null>
    postResponse?: { status: number; body: unknown }
  } = {},
) {
  const config = options.config ?? {}
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }],
      }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        positions: [
          {
            contractId: 12,
            chipId: 'CHIP-001',
            timestamp: '2026-10-10T08:00:05Z',
            latitude: 48.8566,
            longitude: 2.3522,
            ambientTemperature: 19.1,
            humidity: 55,
            mass: 420,
            mpuTemperature: 21.5,
            accelG: 1.02,
          },
        ],
      }),
    }),
  )

  let getCalls = 0
  await page.route('**/devices/config.php**', (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      const response = options.postResponse ?? {
        status: 202,
        body: { deviceId: 'CHIP-001', contractId: 12, modifiedFields: ['FREQ_MESURE_CL'] },
      }
      route.fulfill({
        status: response.status,
        contentType: 'application/json',
        body: JSON.stringify(response.body),
      })
      return
    }
    getCalls += 1
    // After an accepted (202) write, the next GET reflects the just-saved
    // value (FR13) — the first GET (initial load) keeps using `config`.
    const body =
      getCalls > 1 && (options.postResponse === undefined || options.postResponse.status === 202)
        ? { deviceId: 'CHIP-001', contractId: 12, reglageId: 2, updatedAt: null, config: { ...config, FREQ_MESURE_CL: '10' } }
        : { deviceId: 'CHIP-001', contractId: 12, reglageId: 1, updatedAt: null, config }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

test('an accepted change shows a success flash and refreshes the displayed placeholder (FR11, FR13)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page, { config: { FREQ_MESURE_CL: '3' } })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('settings-field-FREQ_MESURE_CL').fill('10')
  await page.getByTestId('settings-form-submit').click()

  await expect(page.getByTestId('settings-form-flash')).toContainText('Réglages enregistrés')
  await expect(page.getByTestId('settings-form-flash')).toContainText('prochaine remontée sur le port 3')
  await expect(page.getByTestId('settings-field-FREQ_MESURE_CL')).toHaveAttribute('placeholder', '10')
})

test('a 409 contract_inactive response shows the server message, does not change the placeholder, and disables the submit control (FR4, FR11)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page, {
    config: { FREQ_MESURE_CL: '3' },
    postResponse: {
      status: 409,
      body: {
        error: {
          code: 'contract_inactive',
          message: "Ce contrat n'est pas actif aujourd'hui : aucun réglage ne peut être envoyé.",
        },
      },
    },
  })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('settings-field-FREQ_MESURE_CL').fill('10')
  await page.getByTestId('settings-form-submit').click()

  await expect(page.getByTestId('settings-form-flash')).toContainText(
    "Ce contrat n'est pas actif aujourd'hui",
  )
  await expect(page.getByTestId('settings-field-FREQ_MESURE_CL')).toHaveAttribute('placeholder', '3')
  // KAN-173 (FR4): matches TransferForm's own reaction to this same signal —
  // the UI must disable the settings *and* transfer submit controls once the
  // API reports the contract inactive, not only one of the two forms.
  await expect(page.getByTestId('settings-form-submit')).toBeDisabled()
})

test('a 400 "no values changed" response is shown as an informational result, not an error (FR11)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page, {
    config: { FREQ_MESURE_CL: '3' },
    postResponse: {
      status: 400,
      body: {
        error: { code: 'invalid_body', message: "Aucune valeur modifiée : la ligne n'a pas été créée." },
      },
    },
  })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('settings-field-FREQ_MESURE_CL').fill('3')
  await page.getByTestId('settings-form-submit').click()

  const flash = page.getByTestId('settings-form-flash')
  await expect(flash).toContainText('Aucune valeur modifiée')
  await expect(flash).toHaveAttribute('data-flash-kind', 'info')
})

test('a browser refresh after a submit never re-sends the write request (FR20)', async ({ page }) => {
  await mockEligibleWorkspace(page, { config: { FREQ_MESURE_CL: '3' } })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('settings-field-FREQ_MESURE_CL').fill('10')

  let postCount = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/devices/config.php')) {
      postCount += 1
    }
  })

  await page.getByTestId('settings-form-submit').click()
  await expect(page.getByTestId('settings-form-flash')).toContainText('Réglages enregistrés')
  expect(postCount).toBe(1)

  await page.reload()
  await page.getByTestId('pilotage-contract-option-12').click()

  // The reload re-renders the whole app from scratch; nothing is replayed.
  await expect(page.getByTestId('settings-form')).toBeVisible()
  expect(postCount).toBe(1)
})
