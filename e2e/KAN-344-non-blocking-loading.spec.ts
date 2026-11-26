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

/**
 * Every skeleton in `scope` must be told apart from the surface it sits on: its background colour differs from
 * the first opaque background among its ancestors (`--card` and `--muted` are one colour, so a muted skeleton on
 * a card is invisible although Playwright still calls it "visible").
 */
async function expectSkeletonsContrast(page: Page, scope: string) {
  const result = await page.evaluate((selector) => {
    const opaque = (value: string) => value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent'
    const skeletons = Array.from(document.querySelectorAll(`${selector} [data-slot="skeleton"]`))
    return {
      count: skeletons.length,
      same: skeletons.filter((el) => {
        const own = getComputedStyle(el).backgroundColor
        let parent = el.parentElement
        while (parent && !opaque(getComputedStyle(parent).backgroundColor)) parent = parent.parentElement
        return parent !== null && getComputedStyle(parent).backgroundColor === own
      }).length,
    }
  }, scope)
  expect(result.count, `skeletons in ${scope}`).toBeGreaterThan(0)
  expect(result.same, `skeletons in ${scope} with the same colour as their surface`).toBe(0)
}

for (const path of ['/pulse', '/live-tracking']) {
  test(`AC12 / AC19: ${path} shows shell, map with tiles and the loader before delayed data @desktop`, async ({ page }) => {
    await mockApi(page, DELAY_MS)
    // The page's CSP forbids `waitForFunction` (eval), so an init script watches the DOM instead and stamps
    // `performance.now()` (counted from the navigation start) when the map container, the loader and a tile
    // image are all there together.
    await page.addInitScript(() => {
      const check = () => {
        const w = window as unknown as { __nfr4?: number }
        if (
          w.__nfr4 === undefined &&
          document.querySelector('.leaflet-container') &&
          document.querySelector('[data-testid="positions-loading"]') &&
          document.querySelector('.leaflet-tile-pane img')
        )
          w.__nfr4 = performance.now()
      }
      new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true })
    })
    await page.goto(path, { waitUntil: 'commit' })
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __nfr4?: number }).__nfr4 ?? null), { timeout: 20_000 })
      .not.toBeNull()
    const elapsed = await page.evaluate(() => (window as unknown as { __nfr4: number }).__nfr4)
    expect(elapsed, 'shell + map + tile + loader within the NFR4 budget').toBeLessThan(BUDGET_MS)
    await expect(page.getByTestId('positions-loading')).toHaveText(/Chargement des positions…/)
    await expect(page.getByRole('navigation').first()).toBeVisible()
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
  await expectSkeletonsContrast(page, '[data-testid="pulse-anomalies-cell"]')
})

test('AC13: the Pulse drawer skeletons stand out from the card surface once contracts answered @desktop', async ({ page }) => {
  await mockApi(page, 0, {
    '/anomalies/': () => ({ status: 200, body: { anomalies: [] } }),
  })
  await page.route('**/anomalies/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await route.fulfill(json({ anomalies: [] })).catch(() => undefined)
  })
  await page.goto('/pulse')
  await expect(page.getByTestId('anomaly-list-loading')).toBeVisible()
  await expectSkeletonsContrast(page, '[data-testid="anomaly-list-loading"]')
})

test('AC19 / AC15: Alerts shows breadcrumb, filter with count placeholders and list skeleton while delayed', async ({ page }) => {
  await mockApi(page, DELAY_MS)
  await page.goto('/alertes')
  await expect(page.getByTestId('breadcrumb-alerts')).toBeVisible({ timeout: BUDGET_MS })
  await expect(page.getByTestId('alerts-status-filter')).toBeVisible({ timeout: BUDGET_MS })
  await expect(page.getByTestId('alerts-status-count-loading-open')).toBeVisible()
  await expect(page.getByTestId('alerts-contracts-loading')).toBeVisible()
  await expectSkeletonsContrast(page, '[data-testid="alerts-status-filter"]')
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
  await expectSkeletonsContrast(page, '[data-testid="pilotage-loading-cards"]')
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
