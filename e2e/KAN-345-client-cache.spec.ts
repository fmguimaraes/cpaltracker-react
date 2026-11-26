import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-345 (epic KAN-339, Page Load Performance) — in-memory client cache with background revalidation.
 * AC20: returning to Pulse, Pilotage or Alerts within the maximum age shows the last data at once and revalidates
 * in the background; an expired entry is not shown; a failed revalidation keeps the data.
 * AC21: logout clears everything (no data of the first user for the next one); nothing is written to browser storage.
 * Revisits are SPA navigations (the cache lives in memory, a reload would empty it).
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

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const row = (anomalyKey: string, chipId: string) => ({
  anomalyKey,
  status: 'detectee',
  code: 'TH',
  label: 'Température >= 28 °C',
  threshold: 28,
  value: 31,
  excess: 3,
  unit: '°C',
  eventDate: '2026-11-05 21:57:00',
  detectedAt: '2026-11-05 22:10:00',
  chipId,
  lot: null,
})

const position = (chipId: string) => ({
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
})

/** What the mocked API answers and when: tests change `data`, hold a request with `hold`, or fail the next one. */
interface Backend {
  anomalies: unknown[]
  positions: unknown[]
  /** While set, data requests wait for it. */
  hold: Promise<void> | null
  failNext: boolean
  requests: string[]
}

async function mockApi(page: Page, backend: Backend) {
  await page.route('**/account.php', (route) => route.fulfill(json({ account })))
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/account.php')) return route.fallback()
    if (url.includes('/auth/login.php')) {
      return route.fulfill(json({ token: `tok-${Date.now()}`, expiresAt: '2027-01-01T00:00:00Z', account }))
    }
    if (url.includes('/auth/logout.php')) return route.fulfill({ status: 204 })
    if (url.includes('/contracts/list.php')) {
      return route.fulfill(json({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }))
    }
    backend.requests.push(url)
    if (backend.hold) await backend.hold
    if (backend.failNext) {
      backend.failNext = false
      return route.fulfill(json({ error: { code: 'service_unavailable', message: 'down' } }, 503))
    }
    if (url.includes('/anomalies/list.php')) return route.fulfill(json({ anomalies: backend.anomalies }))
    if (url.includes('/devices/positions.php') || url.includes('/contracts/pulse.php')) {
      return route.fulfill(json({ positions: backend.positions }))
    }
    if (url.includes('/devices/config.php')) return route.fulfill(json({ deviceId: 'CHIP-001', contractId: 12, config: {} }))
    return route.fulfill(json({}))
  })
}

function newBackend(): Backend {
  return { anomalies: [row('A-1', 'CHIP-001')], positions: [position('CHIP-001')], hold: null, failNext: false, requests: [] }
}

/** Holds data responses until `release()`. */
function holdResponses(backend: Backend): () => void {
  let release!: () => void
  backend.hold = new Promise<void>((resolve) => (release = resolve))
  return () => {
    backend.hold = null
    release()
  }
}

const goTo = (page: Page, path: string) => page.locator(`a[href="${path}"]`).first().click()

test.describe.configure({ mode: 'serial' })

test.describe('KAN-345 client cache @desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('AC20: Alerts revisit shows the cached list at once, then updates in place from the revalidation', async ({ page }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    await page.goto('/alertes?statut=all')
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')

    await goTo(page, '/pulse')
    await expect(page).toHaveURL(/\/pulse/)
    backend.anomalies = [row('A-1', 'CHIP-001'), row('A-2', 'CHIP-002')]
    const release = holdResponses(backend)
    await goTo(page, '/alertes')

    // Revalidation is in flight (held): the old list is on screen, no skeleton.
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')
    await expect(page.getByTestId('alerts-loading')).toHaveCount(0)
    release()
    await expect(page.getByTestId('alerts-count')).toHaveText('2 alertes')
    await expect(page.getByTestId('alerts-loading')).toHaveCount(0)
  })

  test('AC20: a failed background revalidation keeps the cached list, with no error state', async ({ page }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    await page.goto('/alertes?statut=all')
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')

    await goTo(page, '/pulse')
    await expect(page).toHaveURL(/\/pulse/)
    backend.failNext = true
    const before = backend.requests.length
    await goTo(page, '/alertes')
    await expect.poll(() => backend.requests.slice(before).some((url) => url.includes('/anomalies/list.php'))).toBe(true)
    await expect.poll(() => backend.failNext).toBe(false)
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')
    await expect(page.getByTestId('alerts-error')).toHaveCount(0)
    await expect(page.getByTestId('alerts-loading')).toHaveCount(0)
  })

  test('AC20: an entry older than the maximum age is not shown, the page loads normally', async ({ page }) => {
    const backend = newBackend()
    await page.clock.install({ time: new Date('2026-11-26T09:00:00Z') })
    await mockApi(page, backend)
    await page.goto('/alertes?statut=all')
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')

    await goTo(page, '/pulse')
    await expect(page).toHaveURL(/\/pulse/)
    await page.clock.fastForward('06:00')
    const release = holdResponses(backend)
    await goTo(page, '/alertes')
    await expect(page.getByTestId('alerts-loading')).toBeVisible()
    await expect(page.getByTestId('alerts-count')).toHaveCount(0)
    release()
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')
  })

  test('AC20: Pulse revisit keeps the map markers on screen without the loader while it revalidates', async ({ page }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    await page.goto('/pulse')
    await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached()
    await expect(page.getByTestId('positions-loading')).toHaveCount(0)

    await goTo(page, '/alertes')
    await expect(page).toHaveURL(/\/alertes/)
    const release = holdResponses(backend)
    await goTo(page, '/pulse')
    await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached()
    await expect(page.getByTestId('positions-loading')).toHaveCount(0)
    release()
    await expect(page.getByTestId('positions-loading')).toHaveCount(0)
  })

  test('AC20: Pilotage revisit shows the cached device list without a skeleton', async ({ page }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    await page.goto('/pilotage')
    await expect(page.getByTestId('pilotage-device-CHIP-001')).toBeVisible()

    await goTo(page, '/alertes')
    await expect(page).toHaveURL(/\/alertes/)
    const release = holdResponses(backend)
    await goTo(page, '/pilotage')
    await expect(page.getByTestId('pilotage-device-CHIP-001')).toBeVisible()
    await expect(page.getByTestId('pilotage-loading')).toHaveCount(0)
    release()
  })

  test('AC21: logout clears the cache, nothing of the first user shows for the next one; nothing is stored in the browser', async ({ page }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    // `mockApi` answers `/account.php` as signed in; the last registered route wins, so register the signed-out one after.
    await page.route('**/account.php', (route) =>
      route.fulfill(json({ error: { code: 'unauthorized', message: 'Not signed in' } }, 401)),
    )

    const login = async () => {
      await page.goto('/login')
      await page.getByLabel('Adresse e-mail').fill('demo@cpal.test')
      await page.getByLabel('Mot de passe').fill('correct-horse-battery-staple')
      await page.getByTestId('login-submit').click()
      await expect(page).toHaveURL(/\/pulse$/)
    }

    await login()
    await goTo(page, '/alertes')
    await expect(page.getByTestId('alerts-count')).toHaveText('1 alerte')
    const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]))
    expect(stored).not.toContain('CHIP-001')
    expect(stored).not.toContain('A-1')

    await page.getByTestId('user-menu').click()
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/login/)

    // The next user's data is held: nothing of the first user's list may show meanwhile.
    backend.anomalies = [row('B-1', 'CHIP-777'), row('B-2', 'CHIP-778')]
    const release = holdResponses(backend)
    await page.getByLabel('Adresse e-mail').fill('other@cpal.test')
    await page.getByLabel('Mot de passe').fill('correct-horse-battery-staple')
    await page.getByTestId('login-submit').click()
    // The login sends the user back to the page they left (`suite`): the Alerts list, held.
    await expect(page).toHaveURL(/\/alertes/)
    await expect(page.getByTestId('alerts-loading')).toBeVisible()
    await expect(page.getByTestId('alerts-count')).toHaveCount(0)
    release()
    await expect(page.getByTestId('alerts-count')).toHaveText('2 alertes')
  })
})
