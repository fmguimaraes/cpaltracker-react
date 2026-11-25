import { test, expect, type Page } from '@playwright/test'

/**
 * Alerts as full pages: `/alertes` (PAT-LIST: kit DataTable, MobileList at 390 px, status/type/device
 * filters in the URL) and `/alertes/:anomalyKey` (PAT-DETAIL: the Pulse drawer's content on a grid-12 body).
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

const row = (overrides: Record<string, unknown>) => ({
  anomalyKey: 'A-1',
  status: 'detectee',
  code: 'TH',
  label: 'Température >= 28 °C',
  threshold: 28,
  value: 31,
  excess: 3,
  unit: '°C',
  eventDate: '2026-11-05 21:57:00',
  detectedAt: '2026-11-05 22:10:00',
  chipId: 'CHIP-001',
  lot: { cpalLot: 'CP-1', custLotNumber: 'L-100', productName: 'Yaourt' },
  ...overrides,
})

const ROWS = [
  row({ anomalyKey: 'A-1' }),
  row({ anomalyKey: 'A-2', status: 'en_cours', code: 'HH', label: 'Humidité >= 80 %', threshold: 80, value: 85, excess: 5, unit: '%HR', chipId: 'CHIP-002', lot: null }),
  row({ anomalyKey: 'A-3', status: 'cloturee', code: 'GH', label: 'Choc', threshold: 4, value: 6, excess: 2, unit: 'g', chipId: 'CHIP-001' }),
  row({ anomalyKey: 'A-4', code: 'GH', label: 'Choc', threshold: 4, value: 5, excess: 1, unit: 'g', chipId: 'CHIP-002', lot: null }),
]

const detail = {
  ...ROWS[0],
  contract: { contractId: 12, contractType: 'MAIN' },
  rule: 'TH28',
  readings: { temperature: 31, humidity: 52, mass: 420, acceleration: 1.2 },
  position: { lat: 48.8566, lng: 2.3522 },
  referencePoint: null,
  lastChange: null,
  history: [{ at: '2026-11-06 08:00:00', from: 'detectee', to: 'en_cours', by: { name: 'Marie Durand', sameOrganisation: true }, comment: 'Palette inspectée' }],
  allowedTransitions: [{ to: 'fermee', commentRequired: true }],
  readOnlyReason: null,
}

async function mockAlerts(page: Page) {
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/account.php', (route) => route.fulfill(json({ account })))
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill(json({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] })),
  )
  await page.route('**/anomalies/list.php/**', (route) => route.fulfill(json({ anomalies: ROWS })))
  await page.route('**/anomalies/detail.php/**', (route) => {
    const key = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '')
    const found = ROWS.find((item) => item.anomalyKey === key)
    return route.fulfill(found ? json({ ...detail, ...found }) : json({ error: 'not_found' }, 404))
  })
}

test.describe('alerts pages', () => {
  test('list → detail → back, keeping the filters', async ({ page }) => {
    await mockAlerts(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/alertes?statut=all')

    await expect(page).toHaveTitle('Alertes · cPal')
    await expect(page.getByRole('heading', { level: 1, name: 'Alertes' })).toBeAttached()
    await expect(page.getByTestId('shell-breadcrumb')).toContainText('Alertes')
    await expect(page.getByTestId('alerts-table')).toBeVisible()
    await expect(page.getByTestId('alerts-count')).toHaveText('4 alertes')

    // One click on a row opens the detail directly.
    await page.getByTestId('alert-row-A-1').click()
    await expect(page).toHaveURL(/\/alertes\/A-1$/)
    await expect(page.getByTestId('alert-page')).toBeVisible()
    await expect(page.getByTestId('shell-breadcrumb')).toContainText('Alertes')
    await expect(page.getByTestId('shell-breadcrumb')).toContainText('CHIP-001')
    await expect(page.getByTestId('anomaly-title')).toContainText('Température')
    await expect(page.getByTestId('anomaly-lifecycle')).toBeVisible()
    await expect(page.getByTestId('alert-occurrence')).toContainText('Seuil')
    await expect(page.getByTestId('alert-device-link')).toHaveAttribute('href', '/pilotage/CHIP-001')

    // Grid-12: the main column is wider than the side column.
    const main = await page.getByTestId('alert-occurrence').boundingBox()
    const side = await page.getByTestId('alert-device').boundingBox()
    expect(main && side && main.width > side.width).toBe(true)

    await page.getByRole('button', { name: 'Retour à la liste' }).click()
    await expect(page).toHaveURL(/\/alertes\?statut=all$/)
    await expect(page.getByTestId('alerts-count')).toHaveText('4 alertes')
  })

  test('the status filter includes the closed alerts, the device filter is a removable chip', async ({ page }) => {
    await mockAlerts(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/alertes')
    await expect(page.getByTestId('alerts-count')).toHaveText('3 alertes')
    await expect(page.getByTestId('alert-row-A-3')).toHaveCount(0)
    await page.getByTestId('alerts-status-closed').click()
    await expect(page.getByTestId('alert-row-A-3')).toBeVisible()

    await page.goto('/alertes?device=CHIP-002')
    await expect(page.getByTestId('alerts-device-chip')).toContainText('CHIP-002')
    await expect(page.getByTestId('alerts-count')).toHaveText('2 alertes')
    await page.getByTestId('alerts-device-remove').click()
    await expect(page.getByTestId('alerts-device-chip')).toHaveCount(0)
    await expect(page).toHaveURL(/\/alertes$/)
    await expect(page.getByTestId('alerts-count')).toHaveText('3 alertes')
  })

  test('an unknown alert gets the not-found state', async ({ page }) => {
    await mockAlerts(page)
    await page.goto('/alertes/NOPE')
    await expect(page.getByTestId('alert-not-found')).toBeVisible()
    await page.getByRole('link', { name: 'Retour aux alertes' }).click()
    await expect(page).toHaveURL(/\/alertes$/)
  })

  test('390 px: cards instead of the table, no horizontal scroll, detail stacks in one column', async ({ page }) => {
    await mockAlerts(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/alertes')

    await expect(page.getByTestId('alerts-list')).toBeVisible()
    await expect(page.getByTestId('alerts-table')).toHaveCount(0)
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(await overflows()).toBe(false)

    await page.getByTestId('alert-link-A-1').click()
    await expect(page.getByTestId('alert-page')).toBeVisible()
    const occurrence = await page.getByTestId('alert-occurrence').boundingBox()
    const device = await page.getByTestId('alert-device').boundingBox()
    const history = await page.getByTestId('anomaly-history-section').boundingBox()
    // One column: the sections follow one another, the side column's device before the history.
    expect(occurrence && device && occurrence.y < device.y).toBe(true)
    expect(device && history && device.y < history.y).toBe(true)
    expect(device && Math.abs(device.x - (occurrence?.x ?? 0)) < 2).toBe(true)
    expect(await overflows()).toBe(false)
  })
})
