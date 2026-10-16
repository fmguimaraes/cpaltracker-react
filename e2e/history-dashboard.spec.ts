import { test, expect } from '@playwright/test'

/**
 * KAN-172 smoke coverage for the History Dashboard's entry gate and
 * contract/device scoping (FR1, FR2, FR25, NFR5). The map/slider/trail
 * replay (KAN-174) and charts/checklist/lot-hooks/selection summary
 * (KAN-175) are later stories' job — this file only covers the gate, the
 * selector, and the merged access-denied state.
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

function historyBody(contratRef = 'REF-012') {
  return {
    contract: {
      ContratID: 12,
      ContratRef: contratRef,
      ContratType: 'STD',
      ClientID: 7,
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

  await page.goto('/history')

  await expect(page).toHaveURL(/\/login\?suite=%2Fhistory$/)
})

test('an authenticated user sees only their own contracts, no data panels before a selection (FR2)', async ({
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

  await page.goto('/history')

  await expect(page.getByTestId('history-contract-option-12')).toHaveText('REF-012')
  await expect(page.getByTestId('history-dashboard-no-selection')).toBeVisible()
  await expect(page.getByTestId('history-dashboard-ready')).toHaveCount(0)
})

test('selecting a contract loads its history and renders the ready state (FR2)', async ({ page }) => {
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
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody()) }),
  )

  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()

  await expect(page.getByTestId('history-dashboard-ready')).toContainText('REF-012')
})

test('a deep link carrying ?contrat_id= from Live Tracking loads that contract directly (FR2)', async ({
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
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody()) }),
  )

  await page.goto('/history?contrat_id=12&date_from=2026-09-01T00%3A00&date_to=2026-10-01T00%3A00')

  await expect(page.getByTestId('history-dashboard-ready')).toContainText('REF-012')
})

test('clears the selection and shows one generic, non-identifying message for an unauthorized/nonexistent contract (FR25, NFR5)', async ({
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
        contracts: [{ contractId: 99, contractRef: 'REF-099', contractType: 'STD' }],
      }),
    }),
  )
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
    }),
  )

  await page.goto('/history')
  await page.getByTestId('history-contract-option-99').click()

  await expect(page.getByTestId('history-access-error-banner')).toBeVisible()
  await expect(page.getByTestId('history-contract-option-99')).toHaveAttribute('aria-checked', 'false')
  expect(await page.getByTestId('history-access-error-banner').textContent()).not.toContain('99')
})

test('a nonexistent contrat_id deep link produces the identical merged message as a not-yours contract, with no status/timing leak (FR25, NFR5)', async ({
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
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
    }),
  )

  await page.goto('/history?contrat_id=404404')

  await expect(page.getByTestId('history-access-error-banner')).toBeVisible()
  expect(await page.getByTestId('history-access-error-banner').textContent()).not.toContain('404404')
})
