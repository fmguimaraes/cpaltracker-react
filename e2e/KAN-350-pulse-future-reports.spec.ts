import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-350 (epic KAN-339) — Pulse: "Aucun appareil n'a émis de position sur cette période." while every pallet is
 * listed. A preset period ("1 j" … "1 mois") has no upper bound, so a report stamped after the load time (data
 * dated in the future, EC11: the demo runs to 2029) stays on the map; typed calendar days keep their end.
 * The pallet selector's "Localiser" button is enabled exactly for the pallets the map draws (or hidden ones
 * with a position in the period), so it is the DOM probe of "on the map".
 */

const account = {
  userId: 1, clientId: 7, mail: 'demo@cpal.test', nom: 'Demo', prenom: 'User', role: 'client',
  telephone: null, lastLoginAt: null, mustChangePassword: false,
}
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const DAY = 24 * 3600_000
const iso = (ms: number) => new Date(ms).toISOString()
const localDay = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const position = (chipId: string, timestamp: string, latitude: number, longitude: number) => ({
  contractId: 12, chipId, timestamp, latitude, longitude,
  ambientTemperature: 19.1, humidity: 55, mass: 420, mpuTemperature: 21.5, accelG: 1.02, lot: null,
})

async function mockApi(page: Page, positions: unknown[]) {
  await page.route('**/account.php', (route) => route.fulfill(json({ account })))
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/account.php')) return route.fallback()
    if (url.includes('/contracts/list.php')) {
      return route.fulfill(json({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }))
    }
    if (url.includes('/contracts/pulse.php') || url.includes('/devices/positions.php')) {
      return route.fulfill(json({ contract: { contractId: 12, active: true }, generatedAt: iso(Date.now()), positions }))
    }
    if (url.includes('/anomalies/list.php')) return route.fulfill(json({ anomalies: [] }))
    return route.fulfill(json({}))
  })
}

const openPallets = async (page: Page) => {
  await page.getByTestId('pulse-pallets').click()
  await expect(page.getByTestId('pulse-pallets-list')).toBeVisible()
}
const locate = (page: Page, chipId: string) => page.getByTestId(`pulse-pallet-locate-${chipId}`)

test.use({ viewport: { width: 1440, height: 900 } })

test.describe('KAN-350 Pulse future-dated reports @desktop', () => {
  test('350-1 @SI-350 (a) a preset draws a pallet whose last report is in 2029, with no empty-period notice', async ({ page }) => {
    await mockApi(page, [position('FUTURE', '2029-06-01T08:00:00Z', 48.8566, 2.3522)])
    for (const periode of ['1j', '1mois']) {
      await page.goto(`/pulse?periode=${periode}`)
      await expect(page.getByTestId('pulse-pallets')).toContainText('Palettes 1/1')
      await expect(page.locator('.leaflet-container')).toBeVisible()
      await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1)
      await expect(page.getByTestId('positions-period-empty')).toHaveCount(0)
    }
  })

  test('350-2 @SI-350 (b) a preset still hides a pallet whose last report is before its start', async ({ page }) => {
    await mockApi(page, [
      position('FUTURE', '2029-06-01T08:00:00Z', 48.8566, 2.3522),
      position('OLD', iso(Date.now() - 45 * DAY), 35.68, 139.69),
    ])
    await page.goto('/pulse?periode=1mois')
    await expect(page.getByTestId('pulse-pallets')).toContainText('Palettes 2/2')
    await openPallets(page)
    await expect(locate(page, 'FUTURE')).toBeEnabled()
    await expect(locate(page, 'OLD')).toBeDisabled()
    await expect(page.getByTestId('positions-period-empty')).toHaveCount(0)
  })

  test('350-3 @SI-350 (c) typed custom days still hide a report after their end; the notice shows over the mounted map', async ({ page }) => {
    await mockApi(page, [
      position('FUTURE', '2029-06-01T08:00:00Z', 48.8566, 2.3522),
      position('RECENT', iso(Date.now() - 3600_000), 35.68, 139.69),
    ])
    const periode = `${localDay(Date.now() - 20 * DAY)}_${localDay(Date.now() - 10 * DAY)}`
    await page.goto(`/pulse?periode=${periode}`)
    await expect(page.getByTestId('pulse-pallets')).toContainText('Palettes 2/2')
    await expect(page.getByTestId('positions-period-empty')).toBeVisible()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await openPallets(page)
    await expect(locate(page, 'FUTURE')).toBeDisabled()
    await expect(locate(page, 'RECENT')).toBeDisabled()
  })

  test('350-4 @SI-350 (d) "Localiser" on a future-stamped pallet flies to it and opens its drawer', async ({ page }) => {
    await mockApi(page, [
      position('FUTURE', '2029-06-01T08:00:00Z', 48.8566, 2.3522),
      position('FRESH', iso(Date.now() - 3600_000), 35.68, 139.69),
    ])
    await page.goto('/pulse')
    await openPallets(page)
    await expect(locate(page, 'FUTURE')).toBeEnabled()
    await locate(page, 'FUTURE').click()
    await expect(page).toHaveURL(/palette=FUTURE/)
    await expect(page.getByTestId('positions-period-empty')).toHaveCount(0)
  })
})
