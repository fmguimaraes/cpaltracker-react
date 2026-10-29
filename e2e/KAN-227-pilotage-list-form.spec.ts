import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-227 (epic KAN-217) - pilotage on PAT-LIST and PAT-FORM (FR10): contract `Select` in the
 * header, devices as the kit `DataTable` (row testids via rowProps, absolute last-seen time in
 * `title`, virtualized above 50 rows), `MobileList` at 390 px, transfer with `Select` +
 * `DateTimeField`, history as the kit `ActivityTimeline` with a `Badge` for an ongoing transfer.
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

async function mockWorkspace(page: Page, positionsCount = 2) {
  const positions = Array.from({ length: positionsCount }, (_, i) => ({
    contractId: 12,
    chipId: `CHIP-${String(i).padStart(3, '0')}`,
    // The second device has no position: offline dot, no last-seen.
    timestamp: i === 1 ? null : '2026-10-10T08:00:05Z',
    latitude: 48.8566,
    longitude: 2.3522,
    ambientTemperature: 19.1,
    humidity: 55,
    mass: 420,
    mpuTemperature: 21.5,
    accelG: 1.02,
  }))
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [
          { contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' },
          { contractId: 34, contractRef: 'REF-034-STD', contractType: 'STD' },
        ],
      }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions }) }),
  )
  await page.route('**/devices/config.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deviceId: 'CHIP-000', contractId: 12, reglageId: 1, updatedAt: null, config: {} }),
    }),
  )
}

async function openContract12(page: Page) {
  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()
}

test.describe('KAN-227 pilotage', () => {
  test('AC1 @SI-227-1 the contract choice is a Select in the page header', async ({ page }) => {
    await mockWorkspace(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/pilotage')
    const trigger = page.getByTestId('pilotage-contract-selector')
    await expect(trigger).toHaveAttribute('role', 'combobox')
    await expect(trigger).toHaveText(/— Sélectionner —/)
    await trigger.click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.getByTestId('pilotage-contract-option-12').click()
    await expect(trigger).toHaveText(/REF-012/)
    await expect(page.getByTestId('pilotage-device-list')).toBeVisible()
  })

  test('AC2 @SI-227-2 devices are kit DataTable rows: testid on the row, selection accent, absolute UTC time in title', async ({
    page,
  }) => {
    await mockWorkspace(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await openContract12(page)
    const row = page.getByTestId('pilotage-device-CHIP-000')
    await expect(row).toBeVisible()
    expect(await row.evaluate((el) => el.tagName)).toBe('TR')
    // The first device is selected by default (KAN-163).
    await expect(row).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('pilotage-device-CHIP-001')).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByTestId('pilotage-device-CHIP-000-last-seen')).toHaveText(
      'Dernière position connue : 2026-10-10T08:00:05Z',
    )
    await expect(page.getByTestId('pilotage-device-CHIP-000-last-seen')).toHaveAttribute(
      'title',
      '2026-10-10 08:00:05 UTC',
    )
    await expect(page.getByTestId('pilotage-device-CHIP-001-last-seen')).toHaveCount(0)
    await page.getByTestId('pilotage-device-CHIP-001-select').click()
    await expect(page.getByTestId('pilotage-device-CHIP-001')).toHaveAttribute('aria-selected', 'true')
  })

  test('AC3 @SI-227-3 above 50 devices the table is virtualized and still reaches the last row', async ({ page }) => {
    await mockWorkspace(page, 120)
    await page.setViewportSize({ width: 1440, height: 900 })
    await openContract12(page)
    await expect(page.getByTestId('pilotage-device-list-scroll')).toBeVisible()
    await expect(page.locator('[data-slot="data-table"]')).toHaveAttribute('data-virtualized', 'true')
    const mountedRows = await page.locator('tr[data-testid^="pilotage-device-CHIP-"]').count()
    expect(mountedRows).toBeGreaterThan(0)
    expect(mountedRows).toBeLessThan(120)
    await expect(page.getByTestId('pilotage-device-CHIP-119')).toHaveCount(0)
    // Scroll the table's own container to the end: the last device is mounted.
    await page.locator('[data-slot="table-container"]').evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(page.getByTestId('pilotage-device-CHIP-119')).toBeVisible()
  })

  test('AC4 @SI-227-4 at 390 px the devices are the MobileList cards with a count and "Afficher plus"', async ({
    page,
  }) => {
    await mockWorkspace(page, 25)
    await page.setViewportSize({ width: 390, height: 844 })
    await openContract12(page)
    const list = page.getByTestId('pilotage-device-list')
    await expect(list).toBeVisible()
    expect(await list.evaluate((el) => el.tagName)).toBe('UL')
    await expect(list.locator('> li')).toHaveCount(20)
    await expect(page.getByText('20 sur 25')).toBeVisible()
    await page.getByRole('button', { name: 'Afficher plus' }).click()
    await expect(list.locator('> li')).toHaveCount(25)
    await expect(page.getByRole('button', { name: 'Afficher plus' })).toHaveCount(0)
    // No horizontal page scroll at 390 px (NFR3).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('AC5 @SI-227-5 a transfer is entered with Select + DateTimeField and posted in the monolith datetime shape', async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-06-01T12:00:00'))
    await mockWorkspace(page)
    const bodies: unknown[] = []
    await page.route('**/devices/transfer.php**', (route) => {
      bodies.push(route.request().postDataJSON())
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          deviceId: 'CHIP-000',
          contractId: 12,
          targetContractId: 34,
          targetClientId: 99,
          startDate: '2026-06-10 08:30:00',
          endDate: null,
          openEnded: true,
        }),
      })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await openContract12(page)

    await page.getByTestId('transfer-field-target').click()
    await page.getByTestId('transfer-target-option-34').click()
    await expect(page.getByTestId('transfer-field-target')).toHaveText(/REF-034-STD/)
    await page.getByTestId('transfer-field-startDate').getByRole('button', { name: 'Date de début (jour)' }).click()
    await page.getByRole('button', { name: /June 10th, 2026/ }).click()
    await expect(page.getByTestId('transfer-field-startDate').getByRole('button')).toHaveText(/2026-06-10/)
    await page.getByLabel('Date de début (heure)').fill('08:30')
    await page.getByTestId('transfer-form-submit').click()

    await expect(page.getByTestId('transfer-flash-ok')).toContainText('en cours')
    expect(bodies).toEqual([{ targetContractId: 34, startDate: '2026-06-10T08:30', endDate: null }])

    // History: kit ActivityTimeline item with the ongoing Badge.
    const item = page.getByTestId('transfer-history-row-CHIP-000-0')
    await expect(item).toBeVisible()
    expect(await item.evaluate((el) => el.closest('[data-slot="activity-timeline"]') !== null)).toBe(true)
    await expect(item).toContainText('CHIP-000 → contrat #34')
    await expect(page.getByTestId('transfer-history-row-CHIP-000-0-ongoing')).toHaveText('en cours')
    await expect(item.locator('time')).toHaveText('2026-06-10 08:30 UTC')
  })
})
