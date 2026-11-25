import { test, expect, type Page } from '@playwright/test'

/**
 * Device page extensions: the readings page (`/pilotage/:chipId/releves`: period control, summary
 * tiles, trend chart, newest-first table / cards at 390 px) and the alert indicator + "Alertes"
 * section of the device page.
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

const NOW = Date.now()
const readings = Array.from({ length: 12 }, (_, i) => ({
  c: 'CHIP-000',
  t: NOW - (i + 1) * 3_600_000,
  ts: '',
  p: i % 3 === 0 ? 1 : 0,
  la: i % 3 === 0 ? 48.8566 : null,
  lo: i % 3 === 0 ? 2.3522 : null,
  ta: 18 + (i % 5),
  hr: 50 + i,
  m: 420 - i,
  g: i === 4 ? null : 1 + i / 10,
  tm: 21,
}))

const alerts = [1, 2, 3, 4].map((n) => ({
  anomalyKey: `a${n}`,
  status: n === 2 ? 'en_cours' : 'detectee',
  code: 'TH',
  label: 'Température haute',
  threshold: 8,
  value: 8 + n,
  excess: n,
  unit: '°C',
  eventDate: '2026-11-24 07:00:00',
  detectedAt: '2026-11-24 07:05:00',
  chipId: 'CHIP-000',
  lot: null,
}))

async function mockApi(page: Page, options: { alerts?: unknown[] | 'fail'; history?: unknown[] } = {}) {
  const positions = ['CHIP-000', 'CHIP-001'].map((chipId) => ({
    contractId: 12,
    chipId,
    timestamp: '2026-11-25T08:00:05Z',
    latitude: 48.8566,
    longitude: 2.3522,
    ambientTemperature: 19.1,
    humidity: 55,
    mass: 420,
    mpuTemperature: 21.5,
    accelG: 1.02,
  }))
  const fulfill = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/account.php', (route) => route.fulfill(fulfill({ account })))
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill(fulfill({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] })),
  )
  await page.route('**/devices/positions.php**', (route) => route.fulfill(fulfill({ positions })))
  await page.route('**/devices/config.php**', (route) =>
    route.fulfill(fulfill({ deviceId: 'CHIP-000', contractId: 12, reglageId: 1, updatedAt: null, config: {} })),
  )
  await page.route('**/anomalies/list.php/**', (route) =>
    options.alerts === 'fail'
      ? route.fulfill(fulfill({ error: { code: 'service_unavailable', message: 'down' } }, 503))
      : route.fulfill(fulfill({ anomalies: options.alerts ?? [] })),
  )
  await page.route('**/contracts/history.php/**', (route) => {
    const rows = options.history ?? [...readings, { ...readings[0], c: 'CHIP-001', ta: 99 }]
    return route.fulfill(fulfill({ contract: {}, devices: [], rows, hooks: [], count: rows.length, total: rows.length, sampled: false }))
  })
  // Pages that follow the links (the alerts pages belong to another feature).
  await page.route('**/contracts/transfer-targets.php/**', (route) => route.fulfill(fulfill({ targets: [] })))
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test.describe('pilotage device readings and alerts', () => {
  test('the device page links to the readings page, whose table lists this chip newest first', async ({ page }) => {
    await mockApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/pilotage/CHIP-000')
    await page.getByTestId('pilotage-device-readings-all').click()
    await expect(page).toHaveURL(/\/pilotage\/CHIP-000\/releves$/)
    await expect(page.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pilotage › CHIP-000 › Relevés')

    const rows = page.getByTestId('device-readings-list').getByTestId(/^device-reading-/)
    await expect(rows).toHaveCount(12)
    const ids = await rows.evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-testid')!.replace('device-reading-', ''))))
    expect(ids).toEqual([...ids].sort((a, b) => b - a))
    await expect(page.getByTestId('device-readings-summary-ta')).toContainText('°C')
    await expect(page.getByTestId('device-readings-chart')).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByTestId('device-readings-back').click()
    await expect(page).toHaveURL(/\/pilotage\/CHIP-000$/)
  })

  test('changing the period fetches the range again; an empty range explains itself', async ({ page }) => {
    await mockApi(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/pilotage/CHIP-000/releves')
    await expect(page.getByTestId('device-readings-list')).toBeVisible()
    const request = page.waitForRequest((req) => req.url().includes('/contracts/history.php/12') && req.url().includes('start='))
    await page.getByTestId('time-30d').click()
    expect(await request).toBeTruthy()

    await page.unroute('**/contracts/history.php/**')
    await page.route('**/contracts/history.php/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], hooks: [], devices: [], count: 0, total: 0, sampled: false }) }),
    )
    await page.getByTestId('time-24h').click()
    await expect(page.getByTestId('device-readings-empty')).toBeVisible()
  })

  test('390 px: cards instead of the table, summary first, no horizontal scroll', async ({ page }) => {
    await mockApi(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pilotage/CHIP-000/releves')
    const list = page.getByTestId('device-readings-list')
    await expect(list).toBeVisible()
    expect(await list.evaluate((el) => el.tagName)).toBe('UL')
    await expect(list.getByTestId(/^device-reading-/)).toHaveCount(12)
    const summary = await page.getByTestId('device-readings-summary-section').boundingBox()
    const trend = await page.getByTestId('device-readings-trend-section').boundingBox()
    expect(summary!.y).toBeLessThan(trend!.y)
    await expectNoHorizontalScroll(page)
  })

  test('the device page flags open alerts: danger badge, up to 3 cards, "Voir toutes"', async ({ page }) => {
    await mockApi(page, { alerts })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/pilotage/CHIP-000')
    const badge = page.getByTestId('pilotage-device-alerts-indicator')
    await expect(badge).toHaveText('4 alertes ouvertes')
    await expect(badge).toHaveAttribute('href', '/pilotage/CHIP-000/alertes')
    await expect(page.getByTestId('pilotage-device-alerts-section').getByTestId(/^pilotage-device-alert-/)).toHaveCount(3)
    await expect(page.getByTestId('pilotage-device-alerts-all')).toHaveAttribute('href', '/pilotage/CHIP-000/alertes')
    await expectNoHorizontalScroll(page)
  })

  test('the badge opens the device\'s own alerts page, under "Pilotage › CHIP › Alertes"', async ({ page }) => {
    await mockApi(page, { alerts })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/pilotage/CHIP-000')
    await page.getByTestId('pilotage-device-alerts-indicator').click()
    await expect(page).toHaveURL(/\/pilotage\/CHIP-000\/alertes$/)
    await expect(page.getByTestId('device-alerts-title')).toHaveText('Alertes · CHIP-000')
    await expect(page.getByTestId('shell-breadcrumb')).toHaveAttribute('title', 'Pilotage › CHIP-000 › Alertes')
    await expect(page.getByTestId('alerts-table').getByTestId(/^alert-row-/)).toHaveCount(4)
    await expectNoHorizontalScroll(page)
    await page.getByTestId('device-alerts-back').click()
    await expect(page).toHaveURL(/\/pilotage\/CHIP-000$/)
  })

  test('no open alert is a muted note; a failed fetch leaves the page usable', async ({ page }) => {
    await mockApi(page)
    await page.goto('/pilotage/CHIP-000')
    await expect(page.getByTestId('pilotage-device-alerts-indicator')).toHaveText('Aucune alerte ouverte')

    await page.unroute('**/anomalies/list.php/**')
    await page.route('**/anomalies/list.php/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
    await page.reload()
    await expect(page.getByTestId('pilotage-device-alerts-error')).toBeVisible()
    await expect(page.getByTestId('pilotage-device-readings-section')).toBeVisible()
  })

  test('390 px: the device page shows state (readings, alerts) before the forms, without horizontal scroll', async ({ page }) => {
    await mockApi(page, { alerts })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/pilotage/CHIP-000')
    await expect(page.getByTestId('pilotage-device-alerts-section')).toBeVisible()
    const alertsBox = await page.getByTestId('pilotage-device-alerts-section').boundingBox()
    const settingsBox = await page.getByTestId('pilotage-device-settings-section').boundingBox()
    expect(alertsBox!.y).toBeLessThan(settingsBox!.y)
    await expectNoHorizontalScroll(page)
  })
})
