import { test, expect } from '@playwright/test'

/**
 * KAN-158 smoke coverage for Live Tracking's entry gate and contract
 * selector (FR1/FR2). The map/refresh/filter/messaging behaviour is later
 * stories' job (KAN-160/162/165/168) — this file only covers the gate and
 * the selector's admin-vs-non-admin disclosure.
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

test('redirects an unauthenticated visit to /login, preserving the return path (FR1)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/live-tracking')

  await expect(page).toHaveURL(/\/login\?suite=%2Flive-tracking$/)
})

test('a non-admin sees only their own contracts, with no client name (FR2)', async ({ page }) => {
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

  await page.goto('/live-tracking')

  await expect(page.getByTestId('contract-option-12')).toHaveText('REF-012')
})

test('an admin sees every contract with its client name (FR2)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: { ...account, role: 'admin', clientId: null } }),
    }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [
          { contractId: 12, contractRef: 'REF-012', contractType: 'STD', clientId: 7, clientName: 'Acme Corp' },
          { contractId: 34, contractRef: 'REF-034', contractType: 'MAIN', clientId: 9, clientName: 'Other Client' },
        ],
      }),
    }),
  )

  await page.goto('/live-tracking')

  await expect(page.getByTestId('contract-option-12')).toHaveText('REF-012 (Acme Corp)')
  await expect(page.getByTestId('contract-option-34')).toHaveText('REF-034 (Other Client)')
})

test('a user with zero visible contracts gets an explicit empty state, no selector (FR15)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )

  await page.goto('/live-tracking')

  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()
})

test('selecting a contract renders one marker per positioned device with an accessible tooltip (FR3, FR4, FR7)', async ({
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

  await page.goto('/live-tracking')
  await page.getByTestId('contract-option-12').click()

  const markers = page.locator('.leaflet-marker-icon')
  await expect(markers).toHaveCount(1)

  await markers.first().focus()
  await expect(page.locator('.leaflet-tooltip')).toContainText('10/10/2026 08:00 UTC')
  await expect(page.locator('.leaflet-tooltip')).toContainText('Masse: 420 kg')
})
