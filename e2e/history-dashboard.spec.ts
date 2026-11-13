import { test, expect } from '@playwright/test'
import { pickContract } from './contract-helpers'

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

const twoContracts = [
  { contractId: 12, contractRef: 'REF-012', contractType: 'STD' },
  { contractId: 13, contractRef: 'REF-013', contractType: 'STD' },
]

async function mockTwoContracts(page: import('@playwright/test').Page) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: twoContracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody()) }),
  )
}

// Operator decision 2026-10-29: the first contract is selected by default (no empty "no selection" landing).
test('an authenticated user sees only their own contracts in the header Select, the first one loaded by default (FR2)', async ({
  page,
}) => {
  await mockTwoContracts(page)

  await page.goto('/history')

  const selector = page.getByTestId('contract-selector')
  await expect(selector).toHaveText('REF-012')
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.getByTestId('history-dashboard-no-selection')).toHaveCount(0)
  await selector.click()
  await expect(page.getByTestId('contract-option-12')).toHaveText('REF-012')
  await expect(page.getByTestId('contract-option-13')).toHaveText('REF-013')
  await expect(page.getByRole('option')).toHaveCount(2)
})

test('selecting a contract loads its history and renders the ready state (FR2)', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/contracts/history.php/')) requested.push(request.url())
  })
  await mockTwoContracts(page)

  await page.goto('/history')
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await pickContract(page, 13)

  await expect(page.getByTestId('contract-selector')).toHaveText('REF-013')
  await expect.poll(() => requested.some((url) => url.includes('/contracts/history.php/13'))).toBe(true)
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
})

test('the last selected contract is remembered for the session; a deep link still wins (operator decision 2026-10-29)', async ({
  page,
}) => {
  await mockTwoContracts(page)

  await page.goto('/history')
  await pickContract(page, 13)
  await expect(page.getByTestId('contract-selector')).toHaveText('REF-013')

  await page.reload()
  await expect(page.getByTestId('contract-selector')).toHaveText('REF-013')
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()

  await page.goto('/history?contrat_id=12')
  await expect(page.getByTestId('contract-selector')).toHaveText('REF-012')
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

  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  // A single-contract non-admin sees no selector; the deep link still picks the right contract.
  await expect(page.getByTestId('contract-selector')).toHaveCount(0)
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

  await expect(page.getByTestId('history-access-error-banner')).toBeVisible()
  // A single, rejected contract leaves nothing to pick between: the selector stays hidden.
  await expect(page.getByTestId('contract-selector')).toHaveCount(0)
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
