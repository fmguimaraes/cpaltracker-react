import { test, expect } from '@playwright/test'

/**
 * KAN-159 (epic KAN-140) — Device List & Eligibility/Active-State Gating.
 * Covers FR1-FR6, NFR2, NFR4, NFR9, NFR10. Mirrors live-tracking.spec.ts's
 * mocking pattern (KAN-158/168) — every `/api/v1` call this screen makes is
 * mocked via `page.route`, never a live backend (NFR2).
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

test('redirects an unauthenticated visit to /login, preserving the return path (FR1)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/pilotage')

  await expect(page).toHaveURL(/\/login\?suite=%2Fpilotage$/)
})

test('lists every contract the account can see, in contract context (FR2)', async ({ page }) => {
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

  await page.goto('/pilotage')

  await page.getByTestId('pilotage-contract-selector').click()
  await expect(page.getByTestId('pilotage-contract-option-12')).toHaveText('REF-012')
})

test('shows the reserved-for-MAIN message and no device list when the API reports the contract ineligible (FR3, NFR4)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
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
            timestamp: null,
            latitude: null,
            longitude: null,
            ambientTemperature: null,
            humidity: null,
            mass: null,
            mpuTemperature: null,
            accelG: null,
          },
        ],
      }),
    }),
  )
  await page.route('**/devices/config.php**', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'forbidden', message: 'Device pilotage is limited to MAIN contracts.' },
      }),
    }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('pilotage-ineligible')).toHaveText(
    'Device pilotage is limited to MAIN contracts.',
  )
  await expect(page.getByTestId('pilotage-device-list')).toHaveCount(0)
})

test('shows the live device list for an eligible MAIN contract (FR5, FR6)', async ({ page }) => {
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
          {
            contractId: 12,
            chipId: 'CHIP-002',
            timestamp: null,
            latitude: null,
            longitude: null,
            ambientTemperature: null,
            humidity: null,
            mass: null,
            mpuTemperature: null,
            accelG: null,
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
        config: {},
      }),
    }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('pilotage-device-CHIP-001')).toBeVisible()
  await expect(page.getByTestId('pilotage-device-CHIP-002')).toBeVisible()
  await expect(page.getByTestId('pilotage-device-CHIP-001-last-seen')).toContainText(
    'Dernière position connue',
  )
  await expect(page.getByTestId('pilotage-device-CHIP-002-last-seen')).toHaveCount(0)
})

test('shows an explicit empty state for a contract with zero live devices (FR5)', async ({ page }) => {
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: [] }) }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('pilotage-devices-empty')).toBeVisible()
})

test('clears the selection and shows a generic message on an unauthorized/nonexistent contract (NFR9)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 99, contractRef: 'REF-099', contractType: 'MAIN' }],
      }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
    }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-99').click()

  await expect(page.getByTestId('pilotage-contract-access-error')).toBeVisible()
  await page.getByTestId('pilotage-contract-selector').click()
  await expect(page.getByTestId('pilotage-contract-option-99')).toHaveAttribute('aria-selected', 'false')
  expect(await page.getByTestId('pilotage-contract-access-error').textContent()).not.toContain('99')
})
