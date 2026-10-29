import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-227 (FR10): the transfer dates are the kit `DateTimeField` (calendar popover + time input),
 * as the monolith's datetime-local fields. The clock is fixed in June 2026 (`beforeEach`), so the
 * calendar opens on that month; pick the day there.
 */
async function pickJune2026Day(page: Page, fieldTestId: string, day: number) {
  await page.getByTestId(fieldTestId).getByRole('button').click()
  await page.getByRole('button', { name: new RegExp(`June ${day}(st|nd|rd|th), 2026`) }).click()
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-06-01T12:00:00'))
})

/**
 * KAN-169 (epic KAN-140) — Transfer Form & Transfer History.
 * Covers FR14-FR18. Mirrors KAN-159/KAN-163's mocking pattern: every
 * `/api/v1` call is mocked via `page.route`, never a live backend (NFR2).
 *
 * `POST /devices/transfer.php` is the real endpoint confirmed against
 * `cpaltracker.web/api/openapi.yaml` and `api/v1/devices/transfer.php` —
 * see `src/api/transfer.ts`'s doc comment. The STD target list (FR14) is
 * sourced from `GET /contracts/list.php` filtered to `contractType ===
 * 'STD'` (`src/pilotage/transferTargets.ts`'s doc comment) — a documented
 * gap, not an invented endpoint.
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
  options: { contracts?: Array<{ contractId: number; contractRef: string; contractType: string }> } = {},
) {
  const contracts = options.contracts ?? [
    { contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' },
    { contractId: 34, contractRef: 'REF-034-STD', contractType: 'STD' },
  ]

  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
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
      body: JSON.stringify({ deviceId: 'CHIP-001', contractId: 12, reglageId: 1, updatedAt: null, config: {} }),
    }),
  )
}

test('offers only the API-provided STD contracts as transfer targets, never a free-text id (FR14, CB22)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('transfer-field-target').click()
  await expect(page.getByTestId('transfer-target-option-34')).toHaveText('REF-034-STD')
  await expect(page.getByTestId('transfer-field-target')).toBeVisible()
})

test('submits an open-ended transfer and renders it as "en cours" in both the flash and the history panel (FR15, FR17, FR18, CB23, CB29)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)
  await page.route('**/devices/transfer.php**', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        deviceId: 'CHIP-001',
        contractId: 12,
        targetContractId: 34,
        targetClientId: 99,
        startDate: '2026-06-10',
        endDate: null,
        openEnded: true,
      }),
    }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('transfer-field-target').click()

  await page.getByTestId('transfer-target-option-34').click()
  await pickJune2026Day(page, 'transfer-field-startDate', 10)
  await page.getByTestId('transfer-form-submit').click()

  await expect(page.getByTestId('transfer-flash-ok')).toContainText('en cours')
  await expect(page.getByTestId('transfer-history-row-CHIP-001-0')).toContainText('en cours')
  await expect(page.getByTestId('transfer-history-row-CHIP-001-0')).not.toContainText('9999-12-31')
})

test('rejects an end date that is not strictly after the start date, client-side, before any submission (FR16, CB24)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)
  let transferRequested = false
  await page.route('**/devices/transfer.php**', (route) => {
    transferRequested = true
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('transfer-field-target').click()

  await page.getByTestId('transfer-target-option-34').click()
  await pickJune2026Day(page, 'transfer-field-startDate', 10)
  await pickJune2026Day(page, 'transfer-field-endDate', 1)
  await page.getByTestId('transfer-form-submit').click()

  await expect(page.getByTestId('transfer-field-endDate-error')).toContainText(
    'La fin du transfert doit suivre son début.',
  )
  expect(transferRequested).toBe(false)
})

test("surfaces the API's own rejection (e.g. overlap) verbatim, never a client-guessed message (FR17)", async ({
  page,
}) => {
  await mockEligibleWorkspace(page)
  await page.route('**/devices/transfer.php**', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'transfer_overlap',
          message:
            "Ce device fait déjà l'objet d'un transfert sur une période qui recouvre celle-ci. Clôturez le transfert en cours avant d'en ouvrir un autre.",
        },
      }),
    }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('transfer-field-target').click()

  await page.getByTestId('transfer-target-option-34').click()
  await pickJune2026Day(page, 'transfer-field-startDate', 10)
  await page.getByTestId('transfer-form-submit').click()

  await expect(page.getByTestId('transfer-flash-ko')).toContainText(
    "Ce device fait déjà l'objet d'un transfert",
  );
})

test('disables the submit control after a 409 contract_inactive rejection (FR4/FR17 shared signal)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)
  await page.route('**/devices/transfer.php**', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'contract_inactive', message: "Ce contrat n'est pas actif aujourd'hui." },
      }),
    }),
  )

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await page.getByTestId('transfer-field-target').click()

  await page.getByTestId('transfer-target-option-34').click()
  await pickJune2026Day(page, 'transfer-field-startDate', 10)
  await page.getByTestId('transfer-form-submit').click()

  await expect(page.getByTestId('transfer-contract-inactive')).toBeVisible()
  await expect(page.getByTestId('transfer-form-submit')).toBeDisabled()
})

test('shows an explicit empty state when the account has no visible STD contract (FR14 gap)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page, {
    contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }],
  })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('transfer-targets-empty')).toBeVisible()
})
