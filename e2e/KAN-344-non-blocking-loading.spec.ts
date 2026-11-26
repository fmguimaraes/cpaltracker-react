import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-344 (epic KAN-339, Page Load Performance) — non-blocking loading UI.
 * AC12 / AC19 (NFR4): with every data API response delayed, the shell, and on Pulse and Suivi en direct the
 * map with its tiles and the loader, are visible within 1.5 s; markers follow when the data arrives.
 */

// The NFR4 timing checks are CPU-sensitive: run this file's tests one after the other.
test.describe.configure({ mode: 'serial' })

const DELAY_MS = 5000
const BUDGET_MS = 1500

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

const position = {
  contractId: 12,
  chipId: 'CHIP-001',
  timestamp: '2026-11-25T08:00:05Z',
  latitude: 48.8566,
  longitude: 2.3522,
  ambientTemperature: 19.1,
  humidity: 55,
  mass: 420,
  mpuTemperature: 21.5,
  accelG: 1.02,
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

function bodyFor(url: string): unknown {
  if (url.includes('/contracts/list.php')) return { contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }
  if (url.includes('/devices/positions.php') || url.includes('/contracts/pulse.php')) return { positions: [position] }
  if (url.includes('/anomalies/')) return { anomalies: [] }
  return {}
}

/** The session answers at once (auth is not a data page); every other API response waits `delay` ms. */
async function mockApi(page: Page, delay: number, overrides: Record<string, () => { status: number; body: unknown }> = {}) {
  await page.clock.setFixedTime(new Date('2026-11-26T09:00:00Z'))
  await page.route('**/account.php', (route) => route.fulfill(json({ account })))
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/account.php')) return route.fallback()
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
    const override = Object.entries(overrides).find(([key]) => url.includes(key))?.[1]
    if (override) {
      const { status, body } = override()
      return route.fulfill(json(body, status)).catch(() => undefined)
    }
    return route.fulfill(json(bodyFor(url))).catch(() => undefined)
  })
}

/** Counts base-map tile image requests (any host that is not the app). */
function trackTiles(page: Page) {
  const tiles: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'image' && !request.url().startsWith('http://localhost') && !request.url().startsWith('data:'))
      tiles.push(request.url())
  })
  return tiles
}

for (const path of ['/pulse', '/live-tracking']) {
  test(`AC12 / AC19: ${path} shows shell, map with tiles and the loader before delayed data @desktop`, async ({ page }) => {
    await mockApi(page, DELAY_MS)
    const tiles = trackTiles(page)
    const started = Date.now()
    await page.goto(path, { waitUntil: 'commit' })

    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: BUDGET_MS })
    await expect(page.getByTestId('positions-loading')).toBeVisible({ timeout: BUDGET_MS })
    await expect(page.getByTestId('positions-loading')).toHaveText(/Chargement des positions…/)
    await expect(page.locator('.leaflet-tile-pane')).toBeAttached()
    await expect(page.getByRole('navigation').first()).toBeVisible()
    await expect.poll(() => tiles.length, { timeout: BUDGET_MS }).toBeGreaterThan(0)
    expect(Date.now() - started, 'shell + map + tiles + loader within the NFR4 budget').toBeLessThan(BUDGET_MS)
    // No full-height skeleton in place of the map.
    await expect(page.locator('[data-testid="positions-loading"] [data-slot="skeleton"]')).toHaveCount(0)

    // Data arrives: the loader goes, the marker is drawn.
    await expect(page.getByTestId('positions-loading')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached()
  })
}

test('AC19: Pulse side panel shows list skeletons, not a blank block, while data is delayed @desktop', async ({ page }) => {
  await mockApi(page, DELAY_MS)
  await page.goto('/pulse')
  await expect(page.getByTestId('pulse-anomalies-cell')).toBeVisible({ timeout: BUDGET_MS })
  await expect(page.getByTestId('pulse-anomalies-cell').getByRole('status')).toBeVisible()
})

test('AC19 / AC15: Alerts shows breadcrumb, filter with count placeholders and list skeleton while delayed', async ({ page }) => {
  await mockApi(page, DELAY_MS)
  await page.goto('/alertes')
  await expect(page.getByTestId('breadcrumb-alerts')).toBeVisible({ timeout: BUDGET_MS })
  await expect(page.getByTestId('alerts-status-filter')).toBeVisible({ timeout: BUDGET_MS })
  await expect(page.getByTestId('alerts-status-count-loading-open')).toBeVisible()
  await expect(page.getByTestId('alerts-contracts-loading')).toBeVisible()
})

test('AC19 / AC14: Pilotage shows its breadcrumb and a list skeleton while delayed', async ({ page }) => {
  await mockApi(page, DELAY_MS)
  await page.goto('/pilotage')
  await expect(page.getByTestId('breadcrumb-pilotage')).toBeVisible({ timeout: BUDGET_MS })
  await expect(page.getByTestId('pilotage-contracts-loading')).toBeVisible({ timeout: BUDGET_MS })
})

test('AC14: Pilotage workspace skeleton is table-shaped at md+ and card-shaped below md', async ({ page }) => {
  // Contracts answer at once; the workspace (device list) is the slow part.
  await mockApi(page, 0)
  await page.route('**/devices/positions.php**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.fulfill(json({ positions: [position] })).catch(() => undefined)
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/pilotage')
  await expect(page.getByTestId('pilotage-loading-table')).toBeVisible()
  await expect(page.getByTestId('pilotage-loading-cards')).toBeHidden()
  await page.setViewportSize({ width: 390, height: 800 })
  await expect(page.getByTestId('pilotage-loading-cards')).toBeVisible()
  await expect(page.getByTestId('pilotage-loading-table')).toBeHidden()
})

test('AC17: a positions error keeps the map and offers "Réessayer" which reloads @desktop', async ({ page }) => {
  let failing = true
  await mockApi(page, 0, {
    '/contracts/pulse.php': () => (failing ? { status: 503, body: { error: { code: 'service_unavailable', message: 'x' } } } : { status: 200, body: { positions: [position] } }),
  })
  await page.goto('/pulse')
  await expect(page.getByTestId('positions-error')).toBeVisible()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  failing = false
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByTestId('positions-error')).toHaveCount(0)
  await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached()
})
