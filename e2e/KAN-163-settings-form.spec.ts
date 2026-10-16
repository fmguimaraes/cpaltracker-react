import { test, expect } from '@playwright/test'

/**
 * KAN-163 (epic KAN-140) — Settings Form: Field Groups & Client Validation.
 * Covers FR7-FR10, FR12. Mirrors KAN-159's mocking pattern
 * (KAN-159-device-list-eligibility.spec.ts): every `/api/v1` call is
 * mocked via `page.route`, never a live backend (NFR2).
 *
 * Submission (FR11/FR13) is explicitly out of scope — see
 * `src/pilotage/SettingsForm.tsx`'s doc comment (KAN-166). These scenarios
 * stop at "the form validates and assembles a change set," never assert a
 * POST request was sent.
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
  config: Record<string, string | null> = {},
) {
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
  await page.route('**/devices/config.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        deviceId: 'CHIP-001',
        contractId: 12,
        reglageId: 1,
        updatedAt: null,
        config,
      }),
    }),
  )
}

test('shows two visibly labeled field groups, 5 transmitted + 5 stored-only (FR8, GAP6)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('settings-group-transmitted')).toContainText('Transmises au device')
  await expect(page.getByTestId('settings-group-stored-only')).toContainText(
    'Conservées uniquement — jamais envoyées au device',
  )

  const transmitted = ['FREQ_MESURE_CL', 'WAKEUP_ESP_CL', 'Seuil_TEMPAMB_CL', 'Seuil_HRAMB_CL', 'Seuil_MASSE_CL']
  for (const name of transmitted) {
    await expect(page.getByTestId(`settings-field-${name}`)).toBeVisible()
  }

  const storedOnly = ['SeuilG_CL', 'Seuil_AccelG_CL', 'Seuil_LONG_CL', 'Seuil_LAT_CL', 'Seuil_TEMPMPU_CL']
  for (const name of storedOnly) {
    await expect(page.getByTestId(`settings-field-${name}`)).toBeVisible()
  }
})

test('never shows the binary WiFi credential fields (FR12)', async ({ page }) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('settings-form')).toBeVisible()
  await expect(page.getByTestId('settings-field-WiFi_SSID_CL')).toHaveCount(0)
  await expect(page.getByTestId('settings-field-WiFi_PASS_CL')).toHaveCount(0)
})

test("shows the device's current value as a placeholder hint, never pre-filled (FR7, CB8)", async ({
  page,
}) => {
  await mockEligibleWorkspace(page, { FREQ_MESURE_CL: '3' })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  const input = page.getByTestId('settings-field-FREQ_MESURE_CL')
  await expect(input).toHaveAttribute('placeholder', '3')
  await expect(input).toHaveValue('')
  await expect(page.getByTestId('settings-field-FREQ_MESURE_CL-hint')).toContainText(
    'laissez vide pour conserver la valeur actuelle (3)',
  )
})

test('rejects an out-of-range value client-side before any submission (FR9, CB13)', async ({ page }) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('settings-field-FREQ_MESURE_CL').fill('999')
  await page.getByTestId('settings-form-submit').click()

  await expect(page.getByTestId('settings-field-FREQ_MESURE_CL-error')).toContainText(
    'la valeur maximale est 255',
  )
})

test('normalizes a decimal comma to a dot for a float field (FR9, CB13)', async ({ page }) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('settings-field-Seuil_TEMPAMB_CL').fill('19,5')
  await page.getByTestId('settings-form-submit').click()

  await expect(page.getByTestId('settings-field-Seuil_TEMPAMB_CL-error')).toHaveCount(0)
})
